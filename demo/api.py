import json
import frappe
from frappe.utils import formatdate

@frappe.whitelist()
def get_rate_details(item_list=None):
    """
    Returns HTML that can be shown in a Dialog.
    item_list can be dict or json string.
    Expected keys: customer, item, warehouse, company
    """

    if not item_list:
        frappe.throw("Missing item_list")

    if isinstance(item_list, str):
        item_list = json.loads(item_list)

    customer = item_list.get("customer")
    item_code = item_list.get("item")
    warehouse = item_list.get("warehouse")
    company = item_list.get("company")

    if not item_code:
        frappe.throw("Item is required")
    if not warehouse:
        frappe.throw("Warehouse is required")

    item_name = frappe.db.get_value("Item", item_code, "item_name") or ""

    # -----------------------------
    # STOCK (Bin)
    # -----------------------------
    bin_row = frappe.db.get_value(
        "Bin",
        {"item_code": item_code, "warehouse": warehouse},
        ["actual_qty", "reserved_qty", "ordered_qty"],
        as_dict=True,
    ) or {"actual_qty": 0, "reserved_qty": 0, "ordered_qty": 0}

    available_qty = float(bin_row.get("actual_qty") or 0)
    reserved_qty = float(bin_row.get("reserved_qty") or 0)
    incoming_qty = float(bin_row.get("ordered_qty") or 0)  # Purchase Orders

    # -----------------------------
    # LAST SELLING PRICE (Customer)
    # -----------------------------
    last_sell = None
    if customer:
        last_sell = frappe.db.sql(
            """
            SELECT sii.rate AS price, si.posting_date AS pdate, si.name AS invoice
            FROM `tabSales Invoice Item` sii
            INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
            WHERE si.docstatus = 1
              AND si.customer = %s
              AND sii.item_code = %s
              {company_filter}
            ORDER BY si.posting_date DESC, si.posting_time DESC, sii.modified DESC
            LIMIT 1
            """.format(company_filter="AND si.company=%s" if company else ""),
            ([customer, item_code, company] if company else [customer, item_code]),
            as_dict=True,
        )
        last_sell = last_sell[0] if last_sell else None

    # -----------------------------
    # LAST PURCHASE RATE (overall)
    # -----------------------------
    last_purchase = frappe.db.sql(
        """
        SELECT pii.rate AS rate, pi.posting_date AS pdate, pi.name AS invoice
        FROM `tabPurchase Invoice Item` pii
        INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
        WHERE pi.docstatus = 1
          AND pii.item_code = %s
        ORDER BY pi.posting_date DESC, pi.posting_time DESC, pii.modified DESC
        LIMIT 1
        """,
        [item_code],
        as_dict=True,
    )
    last_purchase = last_purchase[0] if last_purchase else None

    # -----------------------------
    # PRICE LIST (Standard Selling)
    # -----------------------------
    price_list_name = "Standard Selling"
    price_list_rate = frappe.db.get_value(
        "Item Price",
        {"item_code": item_code, "price_list": price_list_name, "selling": 1},
        "price_list_rate",
    )

    # -----------------------------
    # Build HTML like your screenshot
    # -----------------------------
    def fmt_date(d):
        return formatdate(d) if d else "-"

    def fmt(v):
        if v is None:
            return "-"
        try:
            return f"{float(v):.2f}"
        except:
            return str(v)

    html = f"""
    <div>
      <p><b>Item:</b> {frappe.utils.escape_html(item_code)}:{frappe.utils.escape_html(item_name)}</p>
      <hr>

      <p><b>Stock</b> (Warehouse: {frappe.utils.escape_html(warehouse)})</p>
      <table class="table table-bordered">
        <thead>
          <tr>
            <th>Available quantity</th>
            <th>Reserved quantity</th>
            <th>Incoming quantity</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{fmt(available_qty)}</td>
            <td>{fmt(reserved_qty)}</td>
            <td>{fmt(incoming_qty)}</td>
          </tr>
        </tbody>
      </table>

      <hr>
      <p><b>Last Selling Price</b> (Customer: {frappe.utils.escape_html(customer or "-")})</p>
      <table class="table table-bordered">
        <thead>
          <tr>
            <th>Price</th>
            <th>Date</th>
            <th>Invoice</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{fmt(last_sell["price"]) if last_sell else "-"}</td>
            <td>{fmt_date(last_sell["pdate"]) if last_sell else "-"}</td>
            <td>{frappe.utils.escape_html(last_sell["invoice"]) if last_sell else "-"}</td>
          </tr>
        </tbody>
      </table>

      <hr>
      <p><b>Last Purchase Rate</b></p>
      <div>{fmt(last_purchase["rate"]) if last_purchase else "No records found"}</div>

      <hr>
      <p><b>Price List</b></p>
      <table class="table table-bordered">
        <thead>
          <tr>
            <th>Price List Name</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{frappe.utils.escape_html(price_list_name)}</td>
            <td>{fmt(price_list_rate)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    """

    return html
import frappe

@frappe.whitelist()
def insights_kpis():
    sales = frappe.db.sql("""
        select sum(grand_total) from `tabSales Invoice`
        where docstatus=1
    """)[0][0] or 0

    outstanding = frappe.db.sql("""
        select sum(outstanding_amount) from `tabSales Invoice`
        where docstatus=1
    """)[0][0] or 0

    stock = frappe.db.sql("""
        select sum(stock_value) from `tabBin`
    """)[0][0] or 0

    return {
        "sales_mtd": round(sales, 2),
        "outstanding": round(outstanding, 2),
        "stock_value": round(stock, 2)
    }
