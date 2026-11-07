"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, CircleAlert, GripVertical, Info, FileText } from "lucide-react";
import { toast } from "sonner";
import { runAction } from "@/app/actions";
import type { ClaimFile, WorkspaceDocument } from "@/server/workspace";
import type { ChecklistSlot } from "@/domain/checklist";
import { ruleSource } from "./primitives";
import { DocumentLink } from "./document-preview";
import { ActionButton } from "./action-form";
const labels = {
  MISSING: "Missing",
  STALE: "Stale",
  UNVERIFIED: "To verify",
  SATISFIED: "In order",
};
const priority = { MISSING: 0, STALE: 1, UNVERIFIED: 2, SATISFIED: 3 };
function DropSlot({
  typeId,
  children,
}: {
  typeId: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: typeId });
  return (
    <div ref={setNodeRef} className={`gap-slot ${isOver ? "drag-over" : ""}`}>
      {children}
    </div>
  );
}
function DocumentCard({
  file,
  types,
  move,
}: {
  file: WorkspaceDocument;
  types: ClaimFile["ref"]["types"];
  move: (id: string, type: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, isDragging } =
    useDraggable({ id: file.id });
  const [date, setDate] = useState(file.documentDate ?? "");
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 30 : undefined,
        position: "relative",
      }}
      className="document-card"
    >
      <div className="document-top">
        <button
          type="button"
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${file.fileName} to another slot`}
        >
          <GripVertical size={14} />
        </button>
        <FileText size={14} className="muted shrink-0" />
        <DocumentLink file={file} />
      </div>
      <p className="document-meta">
        {file.classifiedBy === "AI"
          ? `AI-sorted · ${Math.round((file.aiConfidence ?? 0) * 100)}%`
          : "Desk-sorted"}{" "}
        ·{" "}
        {file.status === "CONFIRMED"
          ? "Confirmed"
          : file.status === "FAILED"
            ? "AI failed"
            : "needs confirmation"}
        {file.documentDate && ` · ${file.documentDate}`}
      </p>
      {file.error && <p className="danger-text text-xs mb-2">{file.error}</p>}
      {file.aiReason && (
        <details>
          <summary>AI reasoning</summary>
          <p className="mt-2">{file.aiReason}</p>
        </details>
      )}
      <div className="button-row">
        {file.status !== "CONFIRMED" &&
          file.documentTypeId &&
          file.status !== "FAILED" && (
            <ActionButton
              action="reviewDocument"
              values={{
                documentId: file.id,
                action: "CONFIRM",
                ...(date ? { documentDate: date } : {}),
              }}
              success="Document confirmed"
            >
              Confirm
            </ActionButton>
          )}
        {file.status === "FAILED" && (
          <ActionButton
            action="retryDocument"
            values={{ documentId: file.id }}
            success="AI retry complete"
          >
            Retry AI
          </ActionButton>
        )}
        <select
          className="control"
          aria-label={`Move ${file.fileName} to another slot`}
          value=""
          onChange={(event) => move(file.id, event.target.value)}
        >
          <option value="" disabled>
            Move to…
          </option>
          {types
            .filter((t) => t.id !== file.documentTypeId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
        </select>
      </div>
      <details>
        <summary>Report date</summary>
        <div className="button-row mt-2">
          <label className="sr-only" htmlFor={`date-${file.id}`}>
            Report date
          </label>
          <input
            id={`date-${file.id}`}
            type="date"
            className="control max-w-40"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {file.status === "CONFIRMED" && (
            <ActionButton
              action="reviewDocument"
              values={{
                documentId: file.id,
                action: "CONFIRM",
                documentDate: date || null,
              }}
              success="Report date updated"
            >
              Save date
            </ActionButton>
          )}
        </div>
      </details>
    </article>
  );
}
export function ChecklistBoard({ file }: { file: ClaimFile }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  function move(documentId: string, documentTypeId: string) {
    if (!documentTypeId || pending) return;
    startTransition(async () => {
      const result = await runAction("reviewDocument", {
        documentId,
        action: "MOVE",
        documentTypeId,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Document moved. Confirm its new slot.");
        router.refresh();
      }
    });
  }
  const sorted = [...file.checklist.slots].sort(
    (a, b) => priority[a.state] - priority[b.state],
  );
  const gaps = sorted.filter((s) => s.state !== "SATISFIED");
  const satisfied = sorted.filter((s) => s.state === "SATISFIED");
  const displayed = new Set(
    file.checklist.slots.flatMap((s) => s.documents.map((d) => d.id)),
  );
  const unsorted = file.files.filter((d) =>
    file.checklist.unsorted.some((u) => u.id === d.id),
  );
  const other = file.files.filter(
    (d) => !displayed.has(d.id) && !unsorted.some((u) => u.id === d.id),
  );
  function slot(slot: ChecklistSlot) {
    const type = file.ref.types.find((t) => t.id === slot.rule.documentTypeId)!;
    const tone =
      slot.state === "MISSING"
        ? "danger"
        : slot.state === "SATISFIED"
          ? "success"
          : "warning";
    return (
      <DropSlot key={type.id} typeId={type.id}>
        <div className="slot-heading">
          <div>
            <div className="slot-title">
              {slot.state === "SATISFIED" ? (
                <Check size={15} className="success-text" />
              ) : (
                <CircleAlert
                  size={15}
                  className={
                    slot.state === "MISSING" ? "danger-text" : "warning-text"
                  }
                />
              )}
              <h3>{type.label}</h3>
            </div>
            <div className="slot-meta">
              {slot.rule.requirement === "REQUIRED" ? "Required" : "Optional"}
              {slot.rule.maxAgeHours
                ? ` · Report within ${slot.rule.maxAgeHours} hours`
                : ""}
              <details className="rule-tooltip">
                <summary aria-label={`Why ${type.label} is required`}>
                  <Info size={12} />
                </summary>
                <p>
                  {ruleSource(slot.rule, file.payer.name, file.procedure.name)}
                  {slot.rule.note ? `. ${slot.rule.note}` : ""}
                </p>
              </details>
            </div>
          </div>
          <span className={`pill ${tone}`}>{labels[slot.state]}</span>
        </div>
        {slot.rule.note && slot.state !== "SATISFIED" && (
          <p className="slot-note">{slot.rule.note}</p>
        )}
        {slot.state === "MISSING" && (
          <a className="text-link text-xs inline-block mt-3" href="#upload">
            Upload {type.label.toLowerCase()}
          </a>
        )}
        {slot.documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            file={file.files.find((f) => f.id === doc.id)!}
            types={file.ref.types}
            move={move}
          />
        ))}
      </DropSlot>
    );
  }
  return (
    <DndContext
      id={`claim-${file.claim.id}`}
      sensors={sensors}
      onDragEnd={({ active, over }) => {
        if (over) move(String(active.id), String(over.id));
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press space to pick up a document. Use arrow keys to move, space to drop and escape to cancel. Or use the Move to menu.",
        },
      }}
    >
      <div aria-busy={pending}>
        {gaps.length ? (
          gaps.map(slot)
        ) : (
          <p className="panel-body success-text text-sm flex items-center gap-2">
            <Check size={16} />
            All document requirements are in order.
          </p>
        )}
        {satisfied.length > 0 && (
          <details className="satisfied-summary">
            <summary>{satisfied.length} documents in order</summary>
            {satisfied.map(slot)}
          </details>
        )}
        {unsorted.length > 0 && (
          <section className="gap-slot">
            <h3>
              Unsorted documents{" "}
              <span className="pill warning ml-2">
                {unsorted.length} to review
              </span>
            </h3>
            <p className="slot-meta">
              Choose a document type, then confirm. Failed files never fill a
              checklist slot.
            </p>
            {unsorted.map((doc) => (
              <DocumentCard
                key={doc.id}
                file={doc}
                types={file.ref.types}
                move={move}
              />
            ))}
          </section>
        )}
        {other.length > 0 && (
          <details className="satisfied-summary">
            <summary>{other.length} other documents</summary>
            {other.map((doc) => (
              <DocumentCard
                key={doc.id}
                file={doc}
                types={file.ref.types}
                move={move}
              />
            ))}
          </details>
        )}
      </div>
    </DndContext>
  );
}
