/** Content of the sign-in page's illustration; edit here to change what visitors see. */
export interface ShowcaseRow {
  label: string;
  /** Start column and length on an 8-week grid. */
  start: number;
  span: number;
  /** Share of the bar already done (0-100). */
  done: number;
  color: string;
  /** Ends in a milestone diamond. */
  milestone?: boolean;
}

export const AUTH_SHOWCASE = {
  /** The three verbs of the tagline, shown as large numbered steps. */
  steps: [
    { word: 'Plan', detail: 'Roadmaps, milestones and dependencies' },
    { word: 'Track', detail: 'Boards, timesheets and live workload' },
    { word: 'Deliver', detail: 'Approvals, reports and portfolio health' },
  ],
  weeks: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
  /** Week (0-8, fractions allowed) where the "Today" marker sits. */
  today: 4.4,
  /** Illustrative plan (not live data). */
  rows: [
    { label: 'Discovery', start: 0, span: 2, done: 100, color: '#60a5fa' },
    { label: 'Design system', start: 1.5, span: 2.5, done: 100, color: '#a78bfa' },
    { label: 'Build & integrate', start: 3, span: 3.5, done: 45, color: '#34d399' },
    { label: 'QA & rollout', start: 5.5, span: 2, done: 0, color: '#fbbf24', milestone: true },
  ] satisfies ShowcaseRow[],
};
