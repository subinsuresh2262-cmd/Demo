
frappe.pages["insights-dashboard"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Insights Dashboard",
    single_column: true
  });

  // -----------------------------
  // Filters (Required for P&L API)
  // -----------------------------
  page.add_field({
    fieldname: "company",
    label: "Company",
    fieldtype: "Link",
    options: "Company",
    reqd: 1,
    change: () => refresh_all(page)
  });

  page.add_field({
    fieldname: "from_date",
    label: "From Date",
    fieldtype: "Date",
    reqd: 1,
    change: () => refresh_all(page)
  });

  page.add_field({
    fieldname: "to_date",
    label: "To Date",
    fieldtype: "Date",
    reqd: 1,
    change: () => refresh_all(page)
  });

  // Set default dates
  const today = frappe.datetime.get_today();
  page.fields_dict.to_date.set_value(today);
  page.fields_dict.from_date.set_value(frappe.datetime.add_months(today, -1));

  // Set default company if available
  frappe.db.get_value("Global Defaults", null, "default_company").then((r) => {
    const c = r?.message?.default_company;
    if (c) page.fields_dict.company.set_value(c);
    refresh_all(page);
  });

  // -----------------------------
  // HTML Layout
  // -----------------------------
  page.main.html(`
    <div class="insights-wrap">
      <div class="insights-grid">
        <div class="kpi-card kpi-1" id="kpi-sales-card">
          <div class="kpi-title">Sales (MTD)</div>
          <div class="kpi-value" id="kpi-sales">--</div>
        </div>

        <div class="kpi-card kpi-2" id="kpi-outstanding-card">
          <div class="kpi-title">Outstanding</div>
          <div class="kpi-value" id="kpi-outstanding">--</div>
        </div>

        <div class="kpi-card kpi-3" id="kpi-stock-card">
          <div class="kpi-title">Stock Value</div>
          <div class="kpi-value" id="kpi-stock">--</div>
        </div>
      </div>

  `);

  // Optional: click actions
  document.getElementById("kpi-sales-card").addEventListener("click", () => {
    frappe.set_route("List", "Sales Invoice");
  });

  document.getElementById("kpi-outstanding-card").addEventListener("click", () => {
    frappe.set_route("query-report", "Accounts Receivable");
  });

  document.getElementById("kpi-stock-card").addEventListener("click", () => {
    frappe.set_route("query-report", "Stock Balance");
  });

  // Chart click -> open report
};


// ==============================
// Refresh All
// ==============================
async function refresh_all(page) {
  await load_kpis(page);
}


// ==============================
// KPI API
// ==============================
async function load_kpis(page) {
  try {
    const company = page.fields_dict.company.get_value();
    const from_date = page.fields_dict.from_date.get_value();
    const to_date = page.fields_dict.to_date.get_value();

    const r = await frappe.call({
      method: "demo.api.insights_kpis",
      args: { company, from_date, to_date }
    });

    if (r.message) {
      document.getElementById("kpi-sales").innerText = format_currency(r.message.sales_mtd || 0);
      document.getElementById("kpi-outstanding").innerText = format_currency(r.message.outstanding || 0);
      document.getElementById("kpi-stock").innerText = format_currency(r.message.stock_value || 0);
    }
  } catch (e) {
    console.error("KPI load failed:", e);
  }
}






