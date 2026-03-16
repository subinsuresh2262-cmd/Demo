import json

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    return [
        {
            "label": _("Posting Date"),
            "fieldname": "posting_date",
            "fieldtype": "Date",
            "width": 110,
        },
        {
            "label": _("Ref"),
            "fieldname": "voucher_no",
            "fieldtype": "Dynamic Link",
            "options": "voucher_type",
            "width": 180,
        },
        {
            "label": _("Description"),
            "fieldname": "description",
            "fieldtype": "Data",
            "width": 260,
        },
        {
            "label": _("LPO Number"),
            "fieldname": "po_no",
            "fieldtype": "Data",
            "width": 140,
        },
        {
            "label": _("Debit"),
            "fieldname": "debit",
            "fieldtype": "Currency",
            "width": 120,
        },
        {
            "label": _("Credit"),
            "fieldname": "credit",
            "fieldtype": "Currency",
            "width": 120,
        },
        {
            "label": _("Balance"),
            "fieldname": "balance",
            "fieldtype": "Currency",
            "width": 120,
        },
        {
            "label": _("Voucher Type"),
            "fieldname": "voucher_type",
            "fieldtype": "Data",
            "hidden": 1,
            "width": 120,
        },
    ]


def get_data(filters):
    conditions = [
        "gle.party_type = 'Customer'",
        "gle.is_cancelled = 0",
    ]
    values = {}

    if filters.get("customer"):
        conditions.append("gle.party = %(customer)s")
        values["customer"] = filters.get("customer")

    if filters.get("company"):
        conditions.append("gle.company = %(company)s")
        values["company"] = filters.get("company")

    if filters.get("from_date"):
        conditions.append("gle.posting_date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("gle.posting_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    where_clause = " AND ".join(conditions)

    rows = frappe.db.sql(
    f"""
    SELECT
        gle.posting_date,
        gle.voucher_type,
        gle.voucher_no,
        gle.party,
        COALESCE(gle.remarks, '') AS description,
        CASE
            WHEN gle.voucher_type = 'Sales Invoice' THEN COALESCE(si.po_no, '')
            ELSE ''
        END AS po_no,
        gle.debit_in_account_currency AS debit,
        gle.credit_in_account_currency AS credit
    FROM `tabGL Entry` gle
    LEFT JOIN `tabSales Invoice` si
        ON si.name = gle.voucher_no
    WHERE {where_clause}
    AND gle.voucher_type = 'Sales Invoice'
    AND IFNULL(si.outstanding_amount,0) > 0
    ORDER BY gle.posting_date ASC, gle.creation ASC, gle.name ASC
    """,
    values,
    as_dict=1,
)
    balance = 0
    data = []

    for row in rows:
        debit = flt(row.debit)
        credit = flt(row.credit)
        balance += debit - credit

        data.append(
            {
                "posting_date": row.posting_date,
                "voucher_type": row.voucher_type,
                "voucher_no": row.voucher_no,
                "party": row.party,
                "description": row.description or "",
                "po_no": row.po_no or "",
                "debit": debit,
                "credit": credit,
                "balance": balance,
            }
        )

    return data


@frappe.whitelist()
def get_print_data(filters=None):
    if isinstance(filters, str):
        filters = json.loads(filters)

    filters = filters or {}

    data = get_data(filters)

    company = filters.get("company")
    customer = filters.get("customer")

    company_doc = frappe.get_doc("Company", company) if company else None
    customer_doc = frappe.get_doc("Customer", customer) if customer else None

    letter_head_html = get_letter_head_html(company)
    customer_address = get_customer_primary_address(customer_doc)
    customer_trn = customer_doc.get("custom_trn") if customer_doc else ""

    credit_limit = 0
    if customer and company:
        credit_limit = (
            frappe.db.get_value(
                "Customer Credit Limit",
                {"parent": customer, "company": company},
                "credit_limit",
            )
            or 0
        )

    current_balance = flt(data[-1]["balance"]) if data else 0
    pdc_in_hand = 0
    available_limit = flt(credit_limit) - flt(current_balance)

    grouped_rows = build_grouped_rows(data)

    return {
        "letter_head": letter_head_html,
        "company": {
            "name": company_doc.name if company_doc else "",
            "company_name": company_doc.company_name if company_doc else "",
            "default_currency": company_doc.default_currency if company_doc else "AED",
        },
        "customer": {
            "name": customer_doc.name if customer_doc else "",
            "customer_name": customer_doc.customer_name if customer_doc else "",
            "address": customer_address,
            "custom_trn": customer_trn or "",
        },
        "summary": {
            "credit_limit": flt(credit_limit),
            "current_balance": flt(current_balance),
            "pdc_in_hand": flt(pdc_in_hand),
            "available_limit": flt(available_limit),
        },
        "filters": {
            "company": filters.get("company"),
            "customer": filters.get("customer"),
            "from_date": filters.get("from_date"),
            "to_date": filters.get("to_date") or nowdate(),
        },
        "rows": grouped_rows,
    }


def build_grouped_rows(data):
    grouped_rows = []
    current_month = None
    month_debit = 0
    month_credit = 0
    previous_balance = 0

    for row in data:
        month_label = getdate(row["posting_date"]).strftime("%B %Y")

        if current_month != month_label:
            if current_month is not None:
                grouped_rows.append(
                    {
                        "row_type": "month_total",
                        "description": "Total",
                        "debit": flt(month_debit),
                        "credit": flt(month_credit),
                        "balance": flt(previous_balance),
                    }
                )

            grouped_rows.append(
                {
                    "row_type": "month_header",
                    "description": month_label,
                }
            )

            current_month = month_label
            month_debit = 0
            month_credit = 0

        month_debit += flt(row.get("debit"))
        month_credit += flt(row.get("credit"))
        previous_balance = flt(row.get("balance"))

        grouped_rows.append(
            {
                "row_type": "data",
                "posting_date": row.get("posting_date"),
                "voucher_no": row.get("voucher_no"),
                "description": row.get("description"),
                "po_no": row.get("po_no"),
                "debit": flt(row.get("debit")),
                "credit": flt(row.get("credit")),
                "balance": flt(row.get("balance")),
            }
        )

    if current_month is not None:
        grouped_rows.append(
            {
                "row_type": "month_total",
                "description": "Total",
                "debit": flt(month_debit),
                "credit": flt(month_credit),
                "balance": flt(previous_balance),
            }
        )

    return grouped_rows


def get_letter_head_html(company):
    if not company:
        return ""

    try:
        # First preference: company default letter head
        letter_head_name = frappe.db.get_value("Company", company, "default_letter_head")

        # Fallback: any enabled default letter head
        if not letter_head_name:
            letter_head_name = frappe.db.get_value(
                "Letter Head",
                {"is_default": 1, "disabled": 0},
                "name"
            )

        if not letter_head_name:
            return ""

        lh = frappe.get_doc("Letter Head", letter_head_name)

        # HTML based letter head
        if lh.get("content"):
            return frappe.render_template(lh.content, {"doc": lh})

        # Image based letter head
        if lh.get("image"):
            align = (lh.get("align") or "Left").lower()
            return f"""
                <div style="width:100%; margin-bottom:16px; text-align:{align};">
                    <img src="{lh.image}" style="max-width:100%; max-height:140px;">
                </div>
            """

        return ""

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Outstanding Statement Letter Head Error")
        return ""


def get_customer_primary_address(customer_doc):
    if not customer_doc:
        return ""

    address_name = getattr(customer_doc, "customer_primary_address", None)
    if not address_name:
        return ""

    address = frappe.db.get_value(
        "Address",
        address_name,
        [
            "address_line1",
            "address_line2",
            "city",
            "state",
            "country",
            "pincode",
        ],
        as_dict=1,
    )

    if not address:
        return ""

    parts = [
        address.get("address_line1"),
        address.get("address_line2"),
        address.get("city"),
        address.get("state"),
        address.get("country"),
        address.get("pincode"),
    ]

    return ", ".join([p for p in parts if p])