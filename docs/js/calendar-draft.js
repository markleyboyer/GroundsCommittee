// First-pass "committee year": what typically comes before the Grounds Committee each month.
// This is a DRAFT to be corrected by the committee; the live version is edited on calendar.html
// and stored in Firestore (calendar/{1..12}). Used to seed an empty calendar.
export const CALENDAR_DRAFT = {
  1: { items: [
    { title: "Set the committee's priorities for the year", tag: "Planning" },
    { title: "Review the arborist's recommendations for winter pruning", tag: "Trees" },
    { title: "Confirm the minutes sign-up schedule for the year", tag: "Admin" },
  ] },
  2: { items: [
    { title: "Spring planting plan: what to replace and add", tag: "Planning" },
    { title: "Get quotes for spring cleanup and mulching", tag: "Contractors" },
    { title: "Compare last year's spending with the budget", tag: "Budget" },
  ] },
  3: { items: [
    { title: "Approve the spring cleanup scope and contractor", tag: "Contractors" },
    { title: "Plan the spring volunteer garden day", tag: "Events" },
    { title: "Walk the grounds for winter damage to trees, paths and beds", tag: "Trees" },
  ] },
  4: { items: [
    { title: "Earth Day / Arbor Day volunteer planting", tag: "Events" },
    { title: "Tree planting and replacement requests", tag: "Trees" },
    { title: "Order annuals and container plants", tag: "Planning" },
  ] },
  5: { items: [
    { title: "Summer watering plan and volunteers", tag: "Planning" },
    { title: "Lawn care and pest reports from the contractor", tag: "Contractors" },
  ] },
  6: { items: [
    { title: "Last meeting before the summer break: hand off summer tasks", tag: "Admin" },
    { title: "First look at the fall bulb plan and budget", tag: "Bulbs" },
  ] },
  7: { skip: true, items: [
    { title: "Summer break: no meeting", tag: "Admin" },
    { title: "Watering and heat-stress checks continue", tag: "Planning" },
  ] },
  8: { skip: true, items: [
    { title: "Summer break: no meeting", tag: "Admin" },
    { title: "Bulb catalogs arrive, and buildings start their wish lists on the Bulbs page", tag: "Bulbs" },
    { title: "Early-order bulb discounts end at many suppliers", tag: "Bulbs" },
  ] },
  9: { items: [
    { title: "The meeting may move because of Labor Day", tag: "Admin" },
    { title: "Final bulb orders, with buildings joining each other's orders", tag: "Bulbs" },
    { title: "Plan fall cleanup and leaf removal", tag: "Contractors" },
    { title: "Tree pruning and removals before winter", tag: "Trees" },
  ] },
  10: { items: [
    { title: "Bulb deliveries and planting days", tag: "Bulbs" },
    { title: "Draft the grounds budget request for next year", tag: "Budget" },
    { title: "Leaf cleanup schedule", tag: "Contractors" },
  ] },
  11: { items: [
    { title: "Send bulb receipts to the treasurer for reimbursement", tag: "Budget" },
    { title: "Winter prep: protect plantings and put away hoses", tag: "Planning" },
    { title: "Holiday decorations plan", tag: "Events" },
  ] },
  12: { items: [
    { title: "Year in review: update and close issues on the Issues page", tag: "Admin" },
    { title: "Set next year's meeting dates and skipped months", tag: "Admin" },
    { title: "Thank the year's volunteers", tag: "Events" },
  ] },
};
