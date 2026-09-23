import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, GripVertical, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  addSection,
  deleteBlock,
  deleteSection,
  reorderBlocks,
  reorderSections,
} from "../../editor/document-operations";
import type {
  DocumentEditorAction,
  DocumentSelection,
} from "../../editor/document-state";
import { documentPartLabelFor, useLanguage } from "../../i18n/language";
import type {
  DocumentBlock,
  DocumentBlockType,
  DocumentFile,
} from "../../schema/document";
import { documentPartIcons } from "./part-icons";

// 左の列。セクションとブロックの並び。座標が無いので、できるのは出し入れと並べ替えだけ。
// 並べ替えはつまみをドラッグする(63。@dnd-kit。つまみを選んで Space・矢印でも動く)

// ブロックの1行に出す短い見出し。中身の頭を1行だけ借りる
type SummaryOf<T extends DocumentBlockType> = (
  props: Extract<DocumentBlock, { type: T }>["props"],
) => string;

const summaries: { [T in DocumentBlockType]: SummaryOf<T> } = {
  text: (props) => props.text,
  bullets: (props) => props.items[0] ?? "",
  ordered: (props) => props.items[0]?.text ?? "",
  table: (props) => props.headers.join(" / "),
  cards: (props) => props.items[0]?.title ?? "",
  notice: (props) => props.label ?? props.text,
  note: (props) => props.text,
  alert: (props) => props.text,
  open: (props) => props.text,
  quote: (props) => props.text,
  code: (props) => props.text,
  figure: (props) => props.caption ?? "",
  image: (props) => props.caption ?? props.alt,
  html: () => "",
};

const blockSummary = (block: DocumentBlock): string => {
  // type と props の組はスキーマで保証済み。対応表の引き当てだけ型を広げる
  const summary = summaries[block.type] as SummaryOf<DocumentBlockType>;
  return summary(block.props).split("\n")[0]?.trim() ?? "";
};

// つまみ付きの1行。つまみだけがドラッグの取っ手で、行を押す動きは今までどおり
const SortableRow = ({
  id,
  className,
  dragLabel,
  row,
  children,
}: {
  id: string;
  className: string;
  dragLabel: string;
  // つまみの右に並べるもの(選ぶボタンと削除)
  row: ReactNode;
  // 行の下に続くもの(セクションのブロックの並び)
  children?: ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className={className}
      data-dragging={isDragging ? "true" : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="outline__row">
        <button
          type="button"
          className="icon-button outline__grip"
          aria-label={dragLabel}
          title={dragLabel}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden />
        </button>
        {row}
      </div>
      {children}
    </li>
  );
};

const DeleteButton = ({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => void;
}) => (
  <button
    type="button"
    className="icon-button outline__delete"
    aria-label={label}
    title={label}
    onClick={onDelete}
  >
    <Trash2 size={16} aria-hidden />
  </button>
);

export const DocumentOutline = ({
  document,
  selection,
  onEdit,
}: {
  document: DocumentFile;
  selection: DocumentSelection;
  onEdit: (action: DocumentEditorAction) => void;
}) => {
  const { t } = useLanguage();
  const select = (next: DocumentSelection) =>
    onEdit({ type: "select", selection: next });
  const edit = (next: DocumentFile, nextSelection: DocumentSelection) =>
    onEdit({ type: "edit", document: next, selection: nextSelection });

  // 押しただけで動き出さないよう、少し動かしてから掴む
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // id はセクションとブロックで重ならない(s01…/b01…)ので、どちらを掴んだかは id で分かる
  const isSection = (id: string) =>
    document.sections.some((section) => section.id === id);
  const ownerOf = (id: string) =>
    document.sections.find((section) =>
      section.blocks.some((block) => block.id === id),
    );

  // 落とし先は同じ種類だけにする。セクションはセクションへ、ブロックは同じセクションの中へ
  const collisionDetection: CollisionDetection = (args) => {
    const activeId = String(args.active.id);
    const home = ownerOf(activeId)?.id;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => {
        const id = String(container.id);
        return isSection(activeId) ? isSection(id) : ownerOf(id)?.id === home;
      }),
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (isSection(activeId)) {
      edit(reorderSections(document, activeId, overId), {
        kind: "section",
        sectionId: activeId,
      });
      return;
    }
    const from = ownerOf(activeId);
    if (!from) return;
    edit(reorderBlocks(document, from.id, activeId, overId), {
      kind: "block",
      sectionId: from.id,
      blockId: activeId,
    });
  };

  return (
    <aside className="outline" aria-label={t("doc.outline")}>
      <p className="viewer__slides-head">
        <span>{t("doc.outline")}</span>
        <span className="count-badge">
          {t("unit.sections", { n: document.sections.length })}
        </span>
      </p>

      <button
        type="button"
        className="outline__front"
        aria-current={selection.kind === "front" ? "true" : undefined}
        onClick={() => select({ kind: "front" })}
      >
        <FileText size={16} aria-hidden />
        {t("doc.front")}
      </button>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={document.sections.map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="outline__sections">
            {document.sections.map((section, index) => {
              const selected =
                selection.kind !== "front" &&
                selection.sectionId === section.id;
              return (
                <SortableRow
                  key={section.id}
                  id={section.id}
                  className="outline__section"
                  dragLabel={t("doc.sectionDrag", { n: index + 1 })}
                  row={
                    <>
                      <button
                        type="button"
                        className="outline__heading"
                        data-level={section.level === 3 ? "3" : "2"}
                        aria-current={
                          selected && selection.kind === "section"
                            ? "true"
                            : undefined
                        }
                        onClick={() =>
                          select({ kind: "section", sectionId: section.id })
                        }
                      >
                        <span className="outline__number">{index + 1}</span>
                        <span className="outline__text">
                          {section.heading || t("doc.noHeading")}
                        </span>
                      </button>
                      {selected && selection.kind === "section" && (
                        <DeleteButton
                          label={t("doc.sectionDelete")}
                          onDelete={() => {
                            const result = deleteSection(document, section.id);
                            edit(
                              result.document,
                              result.sectionId
                                ? {
                                    kind: "section",
                                    sectionId: result.sectionId,
                                  }
                                : { kind: "front" },
                            );
                          }}
                        />
                      )}
                    </>
                  }
                >
                  <SortableContext
                    items={section.blocks.map((block) => block.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ol className="outline__blocks">
                      {section.blocks.map((block, blockIndex) => {
                        const current =
                          selection.kind === "block" &&
                          selection.blockId === block.id;
                        const Icon = documentPartIcons[block.type];
                        return (
                          <SortableRow
                            key={block.id}
                            id={block.id}
                            className="outline__block"
                            dragLabel={t("doc.blockDrag", {
                              n: blockIndex + 1,
                            })}
                            row={
                              <>
                                <button
                                  type="button"
                                  className="outline__block-button"
                                  aria-current={current ? "true" : undefined}
                                  onClick={() =>
                                    select({
                                      kind: "block",
                                      sectionId: section.id,
                                      blockId: block.id,
                                    })
                                  }
                                >
                                  <Icon size={14} aria-hidden />
                                  <span className="outline__block-type">
                                    {documentPartLabelFor(block.type, t)}
                                  </span>
                                  <span className="outline__text">
                                    {blockSummary(block)}
                                  </span>
                                </button>
                                {current && (
                                  <DeleteButton
                                    label={t("doc.blockDelete")}
                                    onDelete={() =>
                                      edit(
                                        deleteBlock(
                                          document,
                                          section.id,
                                          block.id,
                                        ),
                                        {
                                          kind: "section",
                                          sectionId: section.id,
                                        },
                                      )
                                    }
                                  />
                                )}
                              </>
                            }
                          />
                        );
                      })}
                    </ol>
                  </SortableContext>
                </SortableRow>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        className="button button--outline button--block"
        onClick={() => {
          const after =
            selection.kind === "front" ? undefined : selection.sectionId;
          const result = addSection(document, after);
          edit(result.document, {
            kind: "section",
            sectionId: result.sectionId,
          });
        }}
      >
        <Plus size={18} aria-hidden />
        {t("doc.addSection")}
      </button>
    </aside>
  );
};
