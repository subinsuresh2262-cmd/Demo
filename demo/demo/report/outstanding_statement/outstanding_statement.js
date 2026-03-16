frappe.query_reports["Outstanding Statement"] = {
    filters: [
        {
            fieldname: "company",
            label: "Company",
            fieldtype: "Link",
            options: "Company",
            reqd: 1
        },
        {
            fieldname: "customer",
            label: "Customer",
            fieldtype: "Link",
            options: "Customer",
            reqd: 1
        },
        {
            fieldname: "from_date",
            label: "From Date",
            fieldtype: "Date"
        },
        {
            fieldname: "to_date",
            label: "To Date",
            fieldtype: "Date",
            default: frappe.datetime.get_today()
        }
    ],

    onload: function(report) {
        report.page.add_inner_button("Print Statement", function() {
            const filters = report.get_values();

            if (!filters.company) {
                frappe.msgprint("Please select Company");
                return;
            }

            if (!filters.customer) {
                frappe.msgprint("Please select Customer");
                return;
            }

            frappe.call({
                method: "demo.demo.report.outstanding_statement.outstanding_statement.get_print_data",
                args: {
                    filters: filters
                },
                freeze: true,
                freeze_message: "Preparing print...",
                callback: function(r) {
                    if (!r.message) {
                        frappe.msgprint("No print data found");
                        return;
                    }

                    const html = get_outstanding_statement_print_html(r.message);
                    const printWindow = window.open("", "_blank");

                    if (!printWindow) {
                        frappe.msgprint("Popup blocked. Please allow popups for printing.");
                        return;
                    }

                    printWindow.document.open();
                    printWindow.document.write(html);
                    printWindow.document.close();

                    setTimeout(() => {
                        printWindow.focus();
                        printWindow.print();
                    }, 700);
                }
            });
        });
    }
};


function formatCurrency(value) {
    const num = Number(value || 0);
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
    });
}


function formatDate(value) {
    if (!value) return "";
    return frappe.datetime.str_to_user(value);
}


function esc(value) {
    return frappe.utils.escape_html(value == null ? "" : String(value));
}


function get_outstanding_statement_print_html(data) {
    const currency = esc(data.company.default_currency || "AED");

    const rowsHtml = (data.rows || []).map((row) => {
        if (row.row_type === "month_header") {
            return `
                <tr class="month-row">
                    <td></td>
                    <td></td>
                    <td class="month-title">${esc(row.description || "")}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            `;
        }

        if (row.row_type === "month_total") {
            return `
                <tr class="total-row">
                    <td></td>
                    <td></td>
                    <td><b>${esc(row.description || "Total")}</b></td>
                    <td></td>
                    <td class="num"><b>${formatCurrency(row.debit)}</b></td>
                    <td class="num"><b>${formatCurrency(row.credit)}</b></td>
                    <td class="num"><b>${formatCurrency(row.balance)}</b></td>
                </tr>
            `;
        }

        return `
            <tr>
                <td>${esc(formatDate(row.posting_date))}</td>
                <td>${esc(row.voucher_no || "")}</td>
                <td>${esc(row.description || "")}</td>
                <td>${esc(row.po_no || "")}</td>
                <td class="num">${row.debit ? formatCurrency(row.debit) : ""}</td>
                <td class="num">${row.credit ? formatCurrency(row.credit) : ""}</td>
                <td class="num">${formatCurrency(row.balance)}</td>
            </tr>
        `;
    }).join("");

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Outstanding Statement</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            margin: 12mm;
            font-size: 14px;
        }

        .letter-head {
            width: 100%;
            margin-bottom: 10px;
        }

        .statement-box {
            border: 1px solid #222;
            margin-top: 8px;
        }

        .statement-title {
            text-align: center;
            font-size: 26px;
            font-weight: 700;
            margin: 10px 0 4px;
        }

        .statement-subtitle {
            text-align: center;
            font-size: 20px;
            margin: 0 0 10px;
        }

        .info-table,
        .summary-table,
        .statement-table {
            width: 100%;
            border-collapse: collapse;
        }

        .info-table td {
            border-top: 1px solid #222;
            border-right: 1px solid #222;
            padding: 8px;
            vertical-align: top;
        }

        .info-table td:last-child {
            border-right: none;
        }

        .summary-table {
            margin: 18px 0;
        }

        .summary-table td {
            border-right: 1px solid #cfcfcf;
            padding: 10px 8px;
            vertical-align: top;
            width: 25%;
        }

        .summary-table td:last-child {
            border-right: none;
        }

        .statement-table th,
        .statement-table td {
            border: 1px solid #bdbdbd;
            padding: 8px 8px;
            vertical-align: top;
        }

        .statement-table thead th {
            background: #8f8f8f;
            color: #000;
            font-weight: 700;
            text-align: left;
        }

        .statement-table .num {
            text-align: right;
            white-space: nowrap;
        }

        .month-row td {
            border-top: none;
            border-bottom: none;
            background: #fff;
        }

        .month-title {
            font-weight: 700;
            padding-top: 10px !important;
            padding-bottom: 6px !important;
        }

        .total-row td {
            font-weight: 700;
            background: #fff;
        }

        .muted-space {
            height: 2px;
        }

        @page {
            size: A4 portrait;
            margin: 10mm;
        }

        @media print {
            body {
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div class="letter-head">
        ${data.letter_head || ""}
    </div>

    <div class="statement-box">
        <div class="statement-title">OUTSTANDING STATEMENT</div>
        <div class="statement-subtitle">${esc(data.customer.customer_name || data.customer.name || "")}</div>

        <table class="info-table">
            <tr>
                <td style="width:55%;">
                    <b>Customer Name:</b> ${esc(data.customer.customer_name || data.customer.name || "")}
                </td>
                <td style="width:45%;">
                    <b>Date:</b> ${esc(formatDate(data.filters.to_date))}
                </td>
            </tr>
            <tr>
                <td>
                    <b>Address:</b> ${esc(data.customer.address || "")}<br><br>
                    <b>TRN:</b>${esc(data.customer.custom_trn || "")}<br>
                </td>
                <td>
                    <b>PDC In Hand:</b> ${formatCurrency(data.summary.pdc_in_hand)} ${currency}
                </td>
            </tr>
        </table>
    </div>

    <table class="summary-table">
        <tr>
            <td><b>Credit Limit:</b> ${formatCurrency(data.summary.credit_limit)} ${currency}</td>
            <td><b>Current Balance:</b> ${formatCurrency(data.summary.current_balance)} ${currency}</td>
            <td><b>PDC Inhand:</b> ${formatCurrency(data.summary.pdc_in_hand)} ${currency}</td>
            <td><b>Available Limit:</b> ${formatCurrency(data.summary.available_limit)} ${currency}</td>
        </tr>
    </table>

    <table class="statement-table">
        <thead>
            <tr>
                <th style="width:11%;">DATE</th>
                <th style="width:15%;">REF</th>
                <th style="width:31%;">DESCRIPTION</th>
                <th style="width:15%;">LPO NUMBER</th>
                <th style="width:9%;">DEBIT</th>
                <th style="width:9%;">CREDIT</th>
                <th style="width:10%;">BALANCE</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>
</body>
</html>
    `;
}