frappe.pages["insights-dashboard"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Insights Dashboard",
    single_column: true,
  });

  // -------------------------
  // Top Filters
  // -------------------------
  page.add_field({
    fieldname: "company",
    label: "Company",
    fieldtype: "Link",
    options: "Company",
    reqd: 1,
    change: () => refresh_all(page),
  });

  page.add_field({
    fieldname: "from_date",
    label: "From Date",
    fieldtype: "Date",
    reqd: 1,
    change: () => refresh_all(page),
  });

  page.add_field({
    fieldname: "to_date",
    label: "To Date",
    fieldtype: "Date",
    reqd: 1,
    change: () => refresh_all(page),
  });

  // Defaults
  const today = frappe.datetime.get_today();
  page.fields_dict.to_date.set_value(today);
  page.fields_dict.from_date.set_value(frappe.datetime.add_months(today, -1));

  // Set default company if available
  frappe.db.get_value("Global Defaults", null, "default_company").then((r) => {
    const c = r?.message?.default_company;
    if (c) page.fields_dict.company.set_value(c);
  });

  // -------------------------
  // UI Layout
  // -------------------------
  page.main.html(`
    <div class="insights-wrap">
      <div class="insights-grid" id="kpi-grid">
        <div class="kpi-card kpi-1" id="kpi-sales-card">
          <div class="kpi-title">Sales (MTD)</div>
          <div class="kpi-value" id="kpi-sales-value">—</div>
        </div>

        <div class="kpi-card kpi-2" id="kpi-outstanding-card">
          <div class="kpi-title">Outstanding</div>
          <div class="kpi-value" id="kpi-outstanding-value">—</div>
        </div>

        <div class="kpi-card kpi-3" id="kpi-stock-card">
          <div class="kpi-title">Stock Value</div>
          <div class="kpi-value" id="kpi-stock-value">—</div>
        </div>
      </div>
      <div class="pl-card">
  <div class="pl-head">
    <div class="pl-title">Profit and Loss</div>
    <div class="pl-sub">Month-to-Month (YTD)</div>
  </div>

  <div class="pl-layout">
    <!-- LEFT KPIs -->
    <div class="pl-kpis" id="pl-kpis">
      <div class="pl-kpi">
        <div class="kpi-name">Gross Profit %</div>
        <div class="kpi-num" id="kpi-gp-pct">—</div>
      </div>
      <div class="pl-kpi">
        <div class="kpi-name">OPEX %</div>
        <div class="kpi-num" id="kpi-opex-pct">—</div>
      </div>
      <div class="pl-kpi">
        <div class="kpi-name">Operating Profit %</div>
        <div class="kpi-num" id="kpi-op-pct">—</div>
      </div>
      <div class="pl-kpi">
        <div class="kpi-name">Net Profit %</div>
        <div class="kpi-num" id="kpi-np-pct">—</div>
      </div>
    </div>

    <!-- MIDDLE CHARTS -->
    <div class="pl-charts">
      <div class="pl-chart-box">
        <div class="box-title">OPEX | Month-to-Month</div>
        <div id="pl-chart" class="pl-chart"></div>
      </div>

      <div class="pl-chart-box">
        <div class="box-title">Net Profit | Month-to-Month</div>
        <div id="np-chart" class="pl-chart"></div>
      </div>
    </div>

    <!-- RIGHT STATEMENT -->
    <div class="pl-statement" id="pl-statement">
      <div class="st-title">Income Statement</div>
      <div class="st-row"><span>Revenue</span><b id="st-rev">—</b></div>
      <div class="st-row"><span>COGS</span><b id="st-cogs">—</b></div>
      <div class="st-row st-gp"><span>Gross Profit</span><b id="st-gp">—</b></div>
      <div class="st-row st-opex"><span>OPEX</span><b id="st-opex">—</b></div>
      <div class="st-row st-ebit"><span>EBIT</span><b id="st-ebit">—</b></div>
      <div class="st-row st-np"><span>Net Profit</span><b id="st-np">—</b></div>
    </div>
  </div>
</div>
  `);

  // Click routes
  setup_routes(page);

  // Initial load
  refresh_all(page);
};


// =============================
// ROUTES
// =============================
function setup_routes(page) {
  // Sales (MTD) -> Sales Invoice list (or Sales Register report)
  document.getElementById("kpi-sales-card").addEventListener("click", () => {
    frappe.set_route("List", "Sales Invoice");
    // or: frappe.set_route("query-report", "Sales Register");
  });

  // Outstanding -> Accounts Receivable
  document.getElementById("kpi-outstanding-card").addEventListener("click", () => {
    frappe.set_route("query-report", "Accounts Receivable");
  });

  // Stock Value -> Stock Balance
  document.getElementById("kpi-stock-card").addEventListener("click", () => {
    frappe.set_route("query-report", "Stock Balance");
  });

  // P&L chart click -> open report
  const pl = document.getElementById("pl-chart");
  if (pl) {
    pl.addEventListener("click", () => {
      frappe.set_route("query-report", "Profit and Loss Statement");
    });
  }
}


// =============================
// REFRESH ALL
// =============================
async function refresh_all(page) {
  await load_kpis(page);
  await load_pl_chart(page);
}


// =============================
// KPI VALUES (From Backend API)
// =============================
async function load_kpis(page) {
  try {
    const r = await frappe.call({
      method: "demo.api.insights_kpis",
      args: {
        company: page.fields_dict.company.get_value(),
        from_date: page.fields_dict.from_date.get_value(),
        to_date: page.fields_dict.to_date.get_value(),
      },
    });

    const msg = r.message || {};
    document.getElementById("kpi-sales-value").innerText = format_currency(msg.sales_mtd || 0);
    document.getElementById("kpi-outstanding-value").innerText = format_currency(msg.outstanding || 0);
    document.getElementById("kpi-stock-value").innerText = format_currency(msg.stock_value || 0);
  } catch (e) {
    console.error("KPI load failed:", e);
  }
}


// =============================
// PROFIT & LOSS CHART
// =============================
async function load_pl_chart(page) {
  const chart_area = document.getElementById("pl-chart");
  const metrics_area = document.getElementById("pl-metrics");
  if (!chart_area || !metrics_area) return;

  const company = page.fields_dict.company.get_value();
  const from_date = page.fields_dict.from_date.get_value();
  const to_date = page.fields_dict.to_date.get_value();

  // If filters not selected yet
  if (!company || !from_date || !to_date) {
    metrics_area.innerHTML = "";
    chart_area.innerHTML = `<div style="padding:12px;color:#6B7280">Select Company and Date range</div>`;
    return;
  }

  chart_area.innerHTML = `<div style="padding:12px;color:#6B7280">Loading...</div>`;
  metrics_area.innerHTML = "";

  // ✅ Use the exact report name you have
  // From your screenshot it is "Profit and Loss Statement"
  const report_name = "Profit and Loss Statement";

  let r;
  try {
    r = await frappe.call({
      method: "frappe.desk.query_report.run",
      args: {
        report_name,
        filters: {
          company,
          from_date,
          to_date,
          periodicity: "Monthly"
        }
      }
    });
  } catch (e) {
    console.error("P&L report call failed:", e);
    chart_area.innerHTML = `<div style="padding:12px;color:#DC2626">P&L report call failed. Check console.</div>`;
    return;
  }

  const msg = r.message || {};
  const rows = msg.result || [];
  const columns = msg.columns || [];

  // Convert columns to objects if needed
  const colObjs = columns.map(c => {
    if (typeof c === "string") {
      const parts = c.split(":");
      return { label: parts[0], fieldname: parts[1] || parts[0], fieldtype: parts[2] || "" };
    }
    return c;
  });

  // Month columns (currency type)
  const monthCols = colObjs.filter(c => (c.fieldtype || "").toLowerCase() === "currency");
  const labels = monthCols.map(c => c.label);
  const monthFields = monthCols.map(c => c.fieldname);

  if (!rows.length || !labels.length) {
    console.log("P&L columns:", columns);
    console.log("P&L rows sample:", rows.slice(0, 10));
    chart_area.innerHTML = `<div style="padding:12px;color:#6B7280">No monthly data found for selected range.</div>`;
    return;
  }

  // Find Total Income/Expense rows
  const getName = (d) => ((d.account_name || d.account || d.label || "") + "").toLowerCase();
  const incomeRow = rows.find(d => getName(d).includes("total income")) || {};
  const expenseRow =
    rows.find(d => getName(d).includes("total expense")) ||
    rows.find(d => getName(d).includes("total expenses")) ||
    {};

  const incomeVals = monthFields.map(f => flt(incomeRow[f]));
  const expenseVals = monthFields.map(f => flt(expenseRow[f]));
  const profitVals = incomeVals.map((v, i) => v - expenseVals[i]);

  const total_income = incomeVals.reduce((a, b) => a + b, 0);
  const total_expense = expenseVals.reduce((a, b) => a + b, 0);
  const total_profit = total_income - total_expense;

  
  // Metrics
  metrics_area.innerHTML = `
    <div class="pl-metric">
      <div class="label">Total Income</div>
      <div class="value">${format_currency(total_income)}</div>
    </div>
    <div class="pl-metric">
      <div class="label">Total Expense</div>
      <div class="value">${format_currency(total_expense)}</div>
    </div>
    <div class="pl-metric">
      <div class="label">Net Profit/Loss</div>
      <div class="value">${format_currency(total_profit)}</div>
    </div>
  `;

  // Chart
  chart_area.innerHTML = "";
  new frappe.Chart(chart_area, {
    type: "bar",
    height: 320,
    data: {
      labels,
      datasets: [
        { name: "Income", values: incomeVals },
        { name: "Expense", values: expenseVals },
        { name: "Net Profit/Loss", values: profitVals }
      ]
    },
    axisOptions: { xIsSeries: true }
  });

  document.getElementById("pl-chart").innerHTML = "";
new frappe.Chart("#pl-chart", {
  type: "axis-mixed",
  height: 170,
  data: {
    labels,
    datasets: [
      { name: "Income", values: incomeVals, chartType: "bar" },
      { name: "Expense", values: expenseVals, chartType: "bar" },
      { name: "Net Profit", values: profitVals, chartType: "line" }
    ]
  },
  colors: ["#ec4899", "#3b82f6", "#22c55e"],
  barOptions: { stacked: true },
  axisOptions: { xIsSeries: true }
});
document.getElementById("np-chart").innerHTML = "";
new frappe.Chart("#np-chart", {
  type: "line",
  height: 170,
  data: {
    labels,
    datasets: [
      { name: "Net Profit", values: profitVals }
    ]
  },
  colors: ["#22c55e"],
  axisOptions: { xIsSeries: true }
});
document.getElementById("st-rev").innerText = format_currency(total_income);
document.getElementById("st-cogs").innerText = format_currency(0);          // you can calculate later
document.getElementById("st-gp").innerText = format_currency(total_income); // replace with GP if you calculate COGS
document.getElementById("st-opex").innerText = format_currency(total_expense);
document.getElementById("st-ebit").innerText = format_currency(total_profit);
document.getElementById("st-np").innerText = format_currency(total_profit);
const pct = (a,b) => (b ? ((a/b)*100) : 0);

document.getElementById("kpi-gp-pct").innerText = `${pct(total_profit, total_income).toFixed(1)}%`;
document.getElementById("kpi-opex-pct").innerText = `${pct(total_expense, total_income).toFixed(1)}%`;
document.getElementById("kpi-op-pct").innerText = `${pct(total_profit, total_income).toFixed(1)}%`;
document.getElementById("kpi-np-pct").innerText = `${pct(total_profit, total_income).toFixed(1)}%`;

}

