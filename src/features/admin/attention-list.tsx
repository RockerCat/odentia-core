import { ATTENTION_CATEGORY_LABELS, ATTENTION_ITEMS, type AttentionCategory } from "./mock-data";

const CATEGORY_ORDER: AttentionCategory[] = ["trial-ending", "payment-issue", "inactive", "pending-setup"];

export function AttentionList() {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">Requieren atención</h2>

      <div className="mt-4 flex flex-col gap-4">
        {CATEGORY_ORDER.map((category) => {
          const items = ATTENTION_ITEMS.filter((item) => item.category === category);
          if (items.length === 0) return null;

          return (
            <div key={category}>
              <p className="text-[11px] font-semibold tracking-wide text-label-foreground uppercase">
                {ATTENTION_CATEGORY_LABELS[category]}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-foreground">{item.clinicName}</span>
                    <span className="text-xs text-warning">{item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
