import fs from "fs";
import path from "path";

const outDir = path.resolve("data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const categories = [
  { id: 1, name: "Food" },
  { id: 2, name: "Bills" },
  { id: 3, name: "Shopping" },
  { id: 4, name: "Travel" },
  { id: 5, name: "Health" },
  { id: 6, name: "Entertainment" }
];

const accounts = [
  { id: 1, type: "Cash" },
  { id: 2, type: "Credit Card" },
  { id: 3, type: "Bank" }
];

function toCsv(rows) {
  return rows.map((r) => r.map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : v)).join(",")).join("\n");
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

const dateRows = [["date_id", "full_date", "day", "month", "year"]];
const txRows = [["transaction_id", "date_id", "category_id", "account_id", "amount"]];
const budgetRows = [["budget_id", "category_id", "month", "budget_amount"]];
const categoryRows = [["category_id", "category_name"], ...categories.map((c) => [c.id, c.name])];
const accountRows = [["account_id", "account_type"], ...accounts.map((a) => [a.id, a.type])];

const dates = [];
let dateId = 1;
for (let y = 2022; y <= 2025; y++) {
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(Date.UTC(y, m, d));
      if (dt.getUTCMonth() !== m) continue;
      const iso = dt.toISOString().slice(0, 10);
      dateRows.push([dateId, iso, d, m + 1, y]);
      dates.push({ dateId, y, m: m + 1, d });
      dateId += 1;
    }
  }
}

let txId = 1;
for (let i = 0; i < 10000; i++) {
  const pick = Math.random();
  let categoryId;
  let amount;

  if (pick < 0.55) {
    categoryId = 1;
    amount = rand(3, 55);
  } else if (pick < 0.73) {
    categoryId = 2;
    amount = rand(80, 650);
  } else if (pick < 0.92) {
    categoryId = 3;
    amount = Math.random() < 0.12 ? rand(200, 1200) : rand(15, 300);
  } else if (pick < 0.97) {
    categoryId = 4;
    amount = rand(300, 2200);
  } else if (pick < 0.985) {
    categoryId = 5;
    amount = rand(20, 380);
  } else {
    categoryId = 6;
    amount = rand(10, 250);
  }

  const accountId = randomFrom(accounts).id;
  const datePick = randomFrom(dates);
  txRows.push([txId, datePick.dateId, categoryId, accountId, amount.toFixed(2)]);
  txId += 1;
}

let budgetId = 1;
for (let y = 2022; y <= 2025; y++) {
  for (let m = 1; m <= 12; m++) {
    const ym = `${y}-${String(m).padStart(2, "0")}-01`;
    for (const c of categories) {
      const budgetBase = {
        Food: 700,
        Bills: 1400,
        Shopping: 600,
        Travel: 500,
        Health: 350,
        Entertainment: 300
      }[c.name] || 500;
      const seasonality = m === 12 ? 1.2 : 1;
      const budget = (budgetBase * seasonality + rand(-80, 80)).toFixed(2);
      budgetRows.push([budgetId++, c.id, ym, budget]);
    }
  }
}

fs.writeFileSync(path.join(outDir, "dim_date.csv"), toCsv(dateRows));
fs.writeFileSync(path.join(outDir, "dim_category.csv"), toCsv(categoryRows));
fs.writeFileSync(path.join(outDir, "dim_account.csv"), toCsv(accountRows));
fs.writeFileSync(path.join(outDir, "fact_budget.csv"), toCsv(budgetRows));
fs.writeFileSync(path.join(outDir, "fact_transactions.csv"), toCsv(txRows));

console.log("CSV files generated in backend/data");

