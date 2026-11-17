import type { PoStatus, PrStatus } from "@/lib/types";

const STEPS = [
  { n: 1, label: "Create PO request", who: "people" },
  { n: 2, label: "Select vendors", who: "people" },
  { n: 3, label: "Generate RFQ", who: "system" },
  { n: 4, label: "Send to vendors", who: "system" },
  { n: 5, label: "Track & remind", who: "system" },
  { n: 6, label: "Parse responses", who: "system" },
  { n: 7, label: "Compare quotes", who: "system" },
  { n: 8, label: "Manager review", who: "people" },
  { n: 9, label: "Official approval", who: "people" },
  { n: 10, label: "PO confirmed", who: "done" },
  { n: 11, label: "Goods received", who: "people" },
] as const;

/** Which step is "current" for each status. */
const CURRENT: Record<PrStatus, number> = {
  DRAFT: 2, REJECTED_REQUOTE: 2, RFQ_SENT: 5, COLLECTING_QUOTES: 6, UNDER_REVIEW: 8, SENT_BACK: 8,
  PENDING_APPROVAL: 9, APPROVED: 10, PO_ISSUED: 11, CANCELLED: 0,
};

/** After the PO, the stepper follows the goods: 11 = awaiting receipt, 12 = fully received. */
const afterPo = (po?: PoStatus) => (po === "RECEIVED" ? 12 : 11);

export default function WorkflowStepper({ status, skipOfficial, poStatus }: { status: PrStatus; skipOfficial: boolean; poStatus?: PoStatus }) {
  const current = status === "PO_ISSUED" ? afterPo(poStatus) : CURRENT[status];
  return (
    <div className="card overflow-x-auto p-4">
      <ol className="flex min-w-[980px] items-start">
        {STEPS.map((s, i) => {
          const done = status !== "CANCELLED" && s.n < current;
          const active = s.n === current;
          const skipped = s.n === 9 && skipOfficial && current > 9;
          const tone =
            s.who === "people" ? "bg-indigo-600 ring-indigo-200" : s.who === "system" ? "bg-emerald-600 ring-emerald-200" : "bg-slate-700 ring-slate-200";
          return (
            <li key={s.n} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${i === 0 ? "invisible" : done || active ? "bg-slate-400" : "bg-slate-200"}`} />
                <div
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${
                    done ? tone : active ? `${tone} ring-4` : "bg-slate-200 text-slate-500"
                  } ${skipped ? "opacity-40" : ""}`}
                >
                  {done ? (skipped ? "–" : "✓") : s.n}
                </div>
                <div className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "invisible" : done ? "bg-slate-400" : "bg-slate-200"}`} />
              </div>
              <div className={`mt-1.5 px-1 text-[11px] leading-tight ${active ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                {s.label}
                {skipped && <div className="text-[10px] text-slate-400">not required</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex gap-4 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-600" />People (manager, officials)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />System automated</span>
        {status === "CANCELLED" && <span className="font-medium text-rose-600">Request cancelled</span>}
      </div>
    </div>
  );
}
