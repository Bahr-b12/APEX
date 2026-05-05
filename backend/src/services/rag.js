const knowledgeBase = [
  {
    id: "finance_categories",
    text: "Food has frequent small purchases. Bills are monthly and larger. Shopping can have random spikes. Travel is rare and expensive."
  },
  {
    id: "insight_rules",
    text: "Unusual spending can be detected when amount exceeds category monthly mean + 2 standard deviations."
  },
  {
    id: "prediction_rules",
    text: "Next month forecast can be approximated by average of last 3 months with trend from LAG differences."
  }
];

export function retrieveContext(question) {
  const q = question.toLowerCase();
  return knowledgeBase
    .filter((doc) => q.includes("spend") || q.includes("budget") || q.includes("predict") || q.includes("unusual"))
    .map((d) => d.text)
    .join("\n");
}

