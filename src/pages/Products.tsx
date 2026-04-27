import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Bookmark, BookmarkCheck, ChevronRight, GripVertical, Loader2, Pencil, Plus, ScanLine, Star, Trash2, X } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CONCERNS,
  PRODUCT_CATEGORIES,
  PRODUCT_STEPS,
  STEP_CHIP_CLASSES,
  WEEKDAYS,
  db,
  type Concern,
  type Product,
  type ProductCategory,
  type ProductStep,
} from '../db/schema';
import {
  COMMON_IRRITANTS,
  findIngredientInfo,
  findIrritant,
} from '../data/ingredientReference';
import { fmtDate, todayISO } from '../lib/date';
import { scanProductsFromImage, type ScannedProduct } from '../lib/gemini';
import { getGeminiKey } from '../lib/settings';
import ChipMultiSelect from '../components/ChipMultiSelect';

const blank: Product = {
  name: '',
  brand: '',
  step: 'serum',
  category: 'topical',
  concerns: [],
  ingredients: [],
  startedOn: todayISO(),
  timeOfDay: ['am', 'pm'],
  notes: '',
  inRotation: true,
};

export default function Products() {
  const location = useLocation();
  const [editing, setEditing] = useState<Product | null>(null);
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<ScannedProduct[] | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const products = useLiveQuery(async () => {
    const all = await db.products.toArray();
    // Sort: explicit sortOrder ascending; rows without sortOrder fall to the
    // bottom in startedOn-desc order (newest first).
    return all.sort((a, b) => {
      const ao = a.sortOrder;
      const bo = b.sortOrder;
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return b.startedOn.localeCompare(a.startedOn);
    });
  }, []);
  const sensitivities = useLiveQuery(() => db.sensitivities.toArray(), []);

  async function reorderInCategory(list: Product[], fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const updates = next.map((p, i) => ({ ...p, sortOrder: i }));
    await db.products.bulkPut(updates);
  }

  async function toggleRotation(p: Product) {
    if (p.id == null) return;
    await db.products.update(p.id, { inRotation: !p.inRotation });
  }

  // If we navigated here with state.editProductId, open that product's editor
  // once the products query has loaded.
  useEffect(() => {
    const wantId = (location.state as { editProductId?: number } | null)?.editProductId;
    if (wantId == null || !products) return;
    const found = products.find((p) => p.id === wantId);
    if (found) setEditing(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, products]);

  async function handleScan(file: File | undefined) {
    if (!file) return;
    setScanError(null);
    if (!getGeminiKey()) {
      setScanError('Add your Gemini API key in Settings first (gear icon, top right).');
      return;
    }
    setScanning(true);
    try {
      const results = await scanProductsFromImage(file);
      if (results.length === 0) {
        setScanError("Couldn't find any skincare products in that photo. Try a clearer shot of the label, or use Add for manual entry.");
        return;
      }
      if (results.length === 1) {
        const r = results[0];
        setEditing({
          ...blank,
          name: r.name,
          brand: r.brand ?? '',
          step: r.step ?? blank.step,
          concerns: r.concerns,
          ingredients: r.ingredients,
          notes: r.notes ?? '',
        });
      } else {
        setScanResults(results);
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
      if (scanRef.current) scanRef.current.value = '';
    }
  }

  const userSensitiveSet = useMemo(
    () => new Set((sensitivities ?? []).map((s) => s.ingredient.toLowerCase())),
    [sensitivities],
  );

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl text-glow-800">Products</h2>
            <p className="text-xs text-glow-600">
              Track every step in your routine and what it targets.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              className="btn-soft"
              onClick={() => setShowSensitivity(true)}
            >
              Sensitivities
            </button>
            <button
              className="btn-soft"
              onClick={() => scanRef.current?.click()}
              disabled={scanning}
              title="Snap one or many products in a single photo"
            >
              {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
              {scanning ? 'Scanning' : 'Scan'}
            </button>
            <button
              className="btn-primary"
              onClick={() => setEditing({ ...blank })}
              disabled={scanning}
            >
              <Plus size={16} /> Add
            </button>
          </div>
        </div>
        <input
          ref={scanRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleScan(e.target.files?.[0])}
        />
        {scanning && (
          <div className="mt-2 rounded-lg bg-glow-50 border border-glow-200 px-3 py-2 text-xs text-glow-800 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Reading the photo with Gemini… this can take a few seconds.
          </div>
        )}
        {scanError && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">{scanError}</div>
            <button
              type="button"
              onClick={() => setScanError(null)}
              className="text-red-700 font-medium hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {(products?.length ?? 0) === 0 ? (
        <section className="card text-sm text-glow-600/80">
          No products yet. Add the first item in your routine to start tracking.
        </section>
      ) : (
        PRODUCT_CATEGORIES.map((cat) => {
          const inCategory = (products ?? []).filter(
            (p) => (p.category ?? 'topical') === cat.id,
          );
          if (inCategory.length === 0) return null;
          const rotation = inCategory.filter((p) => p.inRotation);
          const backlog = inCategory.filter((p) => !p.inRotation);
          return (
            <div key={cat.id} className="space-y-2">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-glow-700">
                {cat.label}
                <span className="text-glow-500 font-normal">
                  {' '}
                  · {inCategory.length}
                </span>
              </div>

              {rotation.length > 0 && (
                <SortableProductList
                  items={rotation}
                  sensitiveSet={userSensitiveSet}
                  onEdit={(p) => setEditing(p)}
                  onDelete={(p) => db.products.delete(p.id!)}
                  onToggleRotation={toggleRotation}
                  onReorder={(from, to) => reorderInCategory(rotation, from, to)}
                />
              )}

              {backlog.length > 0 && (
                <>
                  <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-glow-500">
                    Not in current rotation
                    <span className="text-glow-400 font-normal">
                      {' '}
                      · {backlog.length}
                    </span>
                  </div>
                  <SortableProductList
                    items={backlog}
                    sensitiveSet={userSensitiveSet}
                    onEdit={(p) => setEditing(p)}
                    onDelete={(p) => db.products.delete(p.id!)}
                    onToggleRotation={toggleRotation}
                    onReorder={(from, to) => reorderInCategory(backlog, from, to)}
                  />
                </>
              )}
            </div>
          );
        })
      )}

      {editing && (
        <ProductEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (next) => {
            const cleaned: Product = {
              ...next,
              name: next.name.trim(),
              brand: next.brand?.trim() || undefined,
              ingredients: next.ingredients
                .map((i) => i.trim().toLowerCase())
                .filter(Boolean),
              notes: next.notes?.trim() || undefined,
              comments: next.comments?.trim() || undefined,
            };
            if (!cleaned.name) return;
            if (cleaned.id) {
              await db.products.put(cleaned);
            } else {
              await db.products.add(cleaned);
            }
            setEditing(null);
          }}
        />
      )}

      {showSensitivity && (
        <SensitivityEditor onClose={() => setShowSensitivity(false)} />
      )}

      {scanResults && (
        <MultiScanModal
          results={scanResults}
          onClose={() => setScanResults(null)}
          onAdd={async (chosen) => {
            for (const r of chosen) {
              await db.products.add({
                name: r.name,
                brand: r.brand,
                step: r.step ?? 'serum',
                concerns: r.concerns,
                ingredients: r.ingredients,
                startedOn: todayISO(),
                timeOfDay: ['am', 'pm'],
                notes: r.notes,
                inRotation: true,
              });
            }
            setScanResults(null);
          }}
        />
      )}
    </div>
  );
}

function DaySelector({
  periodLabel,
  days,
  onChange,
}: {
  periodLabel: string;
  days: number[];
  onChange: (next: number[]) => void;
}) {
  const isEveryDay = days.length === 0;
  function toggle(d: number) {
    if (days.includes(d)) onChange(days.filter((x) => x !== d));
    else onChange([...days, d].sort());
  }
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-glow-700">
          {periodLabel} days
        </span>
        <span className="text-[11px] text-glow-500">
          {isEveryDay ? 'every day' : days.length === 7 ? 'every day' : `${days.length} day${days.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => {
          const active = isEveryDay || days.includes(w.id);
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                // First click while empty (every-day) → switch to a single-day pick.
                if (isEveryDay) {
                  onChange([w.id]);
                  return;
                }
                toggle(w.id);
              }}
              className={`aspect-square rounded-full text-[11px] font-medium border ${
                active
                  ? 'bg-glow-600 text-white border-glow-600'
                  : 'bg-white text-glow-700 border-glow-200 hover:bg-glow-50'
              }`}
              aria-label={`${periodLabel} on ${w.label}`}
              aria-pressed={active}
            >
              {w.short}
            </button>
          );
        })}
      </div>
      {!isEveryDay && (
        <button
          type="button"
          className="mt-1 text-[11px] text-glow-600 hover:underline"
          onClick={() => onChange([])}
        >
          Reset to every day
        </button>
      )}
    </div>
  );
}

function MultiScanModal({
  results,
  onClose,
  onAdd,
}: {
  results: ScannedProduct[];
  onClose: () => void;
  onAdd: (chosen: ScannedProduct[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(results.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);

  const toggle = (i: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-glow-800">
            {results.length} products detected
          </h3>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-glow-600 mb-3">
          Tap to deselect any you don't want to add. Defaults: started today, used AM/PM.
          You can edit each one after saving.
        </p>

        <ul className="space-y-2">
          {results.map((r, i) => {
            const isSel = selected.has(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                    isSel
                      ? 'bg-glow-50 border-glow-300'
                      : 'bg-white/60 border-glow-200 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border ${
                        isSel
                          ? 'bg-glow-600 border-glow-600 text-white'
                          : 'border-glow-300 bg-white'
                      }`}
                    >
                      {isSel && <span className="text-xs leading-none">✓</span>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-glow-900 truncate">{r.name}</span>
                        {r.brand && (
                          <span className="text-xs text-glow-600">{r.brand}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {r.step && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${STEP_CHIP_CLASSES[r.step]}`}
                          >
                            {PRODUCT_STEPS.find((s) => s.id === r.step)?.label ?? r.step}
                          </span>
                        )}
                        {r.concerns.slice(0, 3).map((c) => (
                          <span key={c} className="chip text-[10px]">
                            {CONCERNS.find((x) => x.id === c)?.label ?? c}
                          </span>
                        ))}
                      </div>
                      {r.ingredients.length > 0 && (
                        <div className="mt-1 text-[11px] text-glow-600 line-clamp-2">
                          {r.ingredients.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex justify-between gap-2">
          <button
            className="btn-ghost"
            onClick={() => setSelected(new Set(results.map((_, i) => i)))}
          >
            Select all
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={selected.size === 0 || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onAdd(results.filter((_, i) => selected.has(i)));
                } finally {
                  setSaving(false);
                }
              }}
            >
              Add {selected.size}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableProductList({
  items,
  sensitiveSet,
  onEdit,
  onDelete,
  onToggleRotation,
  onReorder,
}: {
  items: Product[];
  sensitiveSet: Set<string>;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onToggleRotation: (p: Product) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  const ids = items.map((p) => p.id!);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id as number);
    const to = ids.indexOf(over.id as number);
    if (from < 0 || to < 0) return;
    onReorder(from, to);
    // arrayMove imported but unused — silenced.
    void arrayMove;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              sensitiveSet={sensitiveSet}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p)}
              onToggleRotation={() => onToggleRotation(p)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function ProductCard({
  product,
  sensitiveSet,
  onEdit,
  onDelete,
  onToggleRotation,
}: {
  product: Product;
  sensitiveSet: Set<string>;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRotation: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id!,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const [expanded, setExpanded] = useState(false);

  const flags = product.ingredients
    .map((i) => {
      const lower = i.toLowerCase();
      if (sensitiveSet.has(lower)) {
        return { ingredient: i, reason: 'You marked this as a personal sensitivity.', severity: 'severe' as const };
      }
      const irritant = findIrritant(lower);
      if (irritant) return { ingredient: i, reason: irritant.reason, severity: 'mild' as const };
      const info = findIngredientInfo(lower);
      if (info?.cautions?.length) return { ingredient: i, reason: info.cautions[0], severity: 'mild' as const };
      return null;
    })
    .filter(Boolean) as { ingredient: string; reason: string; severity: 'mild' | 'severe' }[];

  const concernSet = new Set(product.concerns);
  product.ingredients.forEach((i) => {
    findIngredientInfo(i)?.targets.forEach((t) => concernSet.add(t));
  });

  const stepLabel = PRODUCT_STEPS.find((s) => s.id === product.step)?.label;
  const timeLabel = product.timeOfDay.length === 2 ? 'AM/PM' : product.timeOfDay.join('/').toUpperCase();

  return (
    <section ref={setNodeRef} style={style} className="card !p-3">
      <div className="flex items-center gap-2">
        <span
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="p-1 rounded-md text-glow-500 hover:text-glow-700 hover:bg-glow-100 cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          aria-expanded={expanded}
        >
          <ChevronRight
            size={14}
            className={`text-glow-500 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {product.brand && (
                <span className="font-display font-bold text-glow-900 truncate">{product.brand}</span>
              )}
              <span className="text-sm text-glow-700 truncate">{product.name}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${STEP_CHIP_CLASSES[product.step]}`}
              >
                {stepLabel}
              </span>
              <span className="text-[10px] text-glow-500">{timeLabel}</span>
              {product.rating ? (
                <span className="inline-flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={10}
                      className={
                        product.rating! >= n
                          ? 'text-yellow-500 fill-yellow-400'
                          : 'text-glow-200'
                      }
                    />
                  ))}
                </span>
              ) : null}
              {flags.length > 0 && (
                <span className="chip-warn text-[10px]" title={`${flags.length} flagged ingredient${flags.length === 1 ? '' : 's'}`}>
                  <AlertTriangle size={10} /> {flags.length}
                </span>
              )}
            </div>
          </div>
        </button>
        <div className="flex gap-0.5 shrink-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggleRotation();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onToggleRotation();
              }
            }}
            className={`btn-ghost p-2 cursor-pointer ${
              product.inRotation ? 'text-glow-700' : 'text-glow-400'
            }`}
            aria-label={product.inRotation ? 'Remove from current rotation' : 'Add to current rotation'}
            aria-pressed={!!product.inRotation}
            title={product.inRotation ? 'In current rotation' : 'Not in current rotation'}
          >
            {product.inRotation ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onEdit();
              }
            }}
            className="btn-ghost p-2 cursor-pointer"
            aria-label="Edit"
          >
            <Pencil size={14} />
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }
            }}
            className="btn-ghost p-2 text-red-600 cursor-pointer"
            aria-label="Delete"
          >
            <Trash2 size={14} />
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-glow-100 pt-3">
          <div className="text-[11px] text-glow-500">
            Started {fmtDate(product.startedOn)}
            {product.stoppedOn ? ` · stopped ${fmtDate(product.stoppedOn)}` : ''}
          </div>

          {concernSet.size > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-glow-700 mb-1">Targets</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(concernSet).map((c) => (
                  <span key={c} className="chip">{CONCERNS.find((x) => x.id === c)?.label ?? c}</span>
                ))}
              </div>
            </div>
          )}

          {product.ingredients.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-glow-700 mb-1">Ingredients</div>
              <p className="text-xs text-glow-700 leading-relaxed">{product.ingredients.join(', ')}</p>
            </div>
          )}

          {flags.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="flex items-center gap-1.5 text-amber-800 font-semibold text-xs mb-1">
                <AlertTriangle size={14} /> Heads up
              </div>
              <ul className="space-y-1">
                {flags.map((f, i) => (
                  <li key={i} className="text-xs text-amber-900">
                    <span className={f.severity === 'severe' ? 'chip-danger mr-1' : 'chip-warn mr-1'}>
                      {f.ingredient}
                    </span>
                    {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.comments && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-glow-700 mb-1">Your review</div>
              <p className="text-xs text-glow-800 whitespace-pre-wrap">{product.comments}</p>
            </div>
          )}

          {product.notes && (
            <p className="text-xs text-glow-600 italic">{product.notes}</p>
          )}
        </div>
      )}
    </section>
  );
}

function ProductEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: Product;
  onClose: () => void;
  onSave: (p: Product) => void;
}) {
  const [draft, setDraft] = useState<Product>(initial);
  const [ingredientInput, setIngredientInput] = useState('');

  const update = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const addIngredient = () => {
    const v = ingredientInput.trim().toLowerCase();
    if (!v) return;
    if (!draft.ingredients.includes(v)) {
      update('ingredients', [...draft.ingredients, v]);
    }
    setIngredientInput('');
  };

  return (
    <Modal onClose={onClose} title={initial.id ? 'Edit product' : 'Add product'}>
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Glow Recipe Strawberry BHA Toner"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Brand</label>
            <input
              className="input"
              value={draft.brand ?? ''}
              onChange={(e) => update('brand', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={draft.category ?? 'topical'}
              onChange={(e) => update('category', e.target.value as ProductCategory)}
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Step</label>
          <select
            className="input"
            value={draft.step}
            onChange={(e) => update('step', e.target.value as ProductStep)}
          >
            {PRODUCT_STEPS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Started</label>
            <input
              type="date"
              className="input"
              value={draft.startedOn}
              onChange={(e) => update('startedOn', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Stopped (optional)</label>
            <input
              type="date"
              className="input"
              value={draft.stoppedOn ?? ''}
              onChange={(e) => update('stoppedOn', e.target.value || undefined)}
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 accent-glow-600"
              checked={!!draft.inRotation}
              onChange={(e) => update('inRotation', e.target.checked)}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-glow-700">
              In current rotation
            </span>
          </label>
          <p className="text-[11px] text-glow-500 mt-1">
            Off-rotation products drop to the bottom of the Products list.
          </p>
        </div>

        <div>
          <label className="label">Time of day</label>
          <div className="flex gap-2">
            {(['am', 'pm'] as const).map((t) => {
              const active = draft.timeOfDay.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={`rounded-full px-4 py-1.5 text-xs font-medium border ${
                    active
                      ? 'bg-glow-600 text-white border-glow-600'
                      : 'bg-white text-glow-700 border-glow-200'
                  }`}
                  onClick={() =>
                    update('timeOfDay', active ? draft.timeOfDay.filter((x) => x !== t) : [...draft.timeOfDay, t])
                  }
                >
                  {t.toUpperCase()}
                </button>
              );
            })}
          </div>
          {(['am', 'pm'] as const).map((t) =>
            draft.timeOfDay.includes(t) ? (
              <DaySelector
                key={t}
                periodLabel={t.toUpperCase()}
                days={draft.schedule?.[t] ?? []}
                onChange={(next) =>
                  update('schedule', {
                    ...(draft.schedule ?? {}),
                    [t]: next.length === 0 ? undefined : next,
                  })
                }
              />
            ) : null,
          )}
        </div>

        <div>
          <label className="label">Targets these concerns</label>
          <ChipMultiSelect
            options={CONCERNS}
            value={draft.concerns}
            onChange={(v) => update('concerns', v as Concern[])}
          />
        </div>

        <div>
          <label className="label">Key ingredients</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="e.g. niacinamide, retinol"
              value={ingredientInput}
              onChange={(e) => setIngredientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addIngredient();
                }
              }}
            />
            <button type="button" className="btn-soft" onClick={addIngredient}>Add</button>
          </div>
          {draft.ingredients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.ingredients.map((i) => (
                <span key={i} className="chip">
                  {i}
                  <button
                    type="button"
                    className="ml-1 text-glow-700"
                    onClick={() => update('ingredients', draft.ingredients.filter((x) => x !== i))}
                    aria-label={`Remove ${i}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label">Your rating</label>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    update('rating', draft.rating === n ? undefined : n)
                  }
                  aria-label={`Rate ${n} of 5`}
                  className="p-0.5"
                >
                  <Star
                    size={20}
                    className={
                      (draft.rating ?? 0) >= n
                        ? 'text-yellow-500 fill-yellow-400'
                        : 'text-glow-200 hover:text-glow-400'
                    }
                  />
                </button>
              ))}
            </div>
            {draft.rating ? (
              <button
                type="button"
                onClick={() => update('rating', undefined)}
                className="text-[11px] text-glow-600 hover:underline"
              >
                Clear
              </button>
            ) : (
              <span className="text-[11px] text-glow-500">Tap a star</span>
            )}
          </div>
        </div>

        <div>
          <label className="label">Comments</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="Your review of this product — texture, smell, results, irritation, repurchase?"
            value={draft.comments ?? ''}
            onChange={(e) => update('comments', e.target.value)}
          />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="Any private notes (e.g. limit to PM, mix with HA serum, etc.)"
            value={draft.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => onSave(draft)}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function SensitivityEditor({ onClose }: { onClose: () => void }) {
  const sensitivities = useLiveQuery(() => db.sensitivities.toArray(), []);
  const [input, setInput] = useState('');
  const [severity, setSeverity] = useState<'mild' | 'moderate' | 'severe'>('moderate');

  async function add() {
    const v = input.trim().toLowerCase();
    if (!v) return;
    try {
      await db.sensitivities.add({ ingredient: v, severity });
    } catch {
      // ignore unique constraint
    }
    setInput('');
  }

  return (
    <Modal onClose={onClose} title="Personal sensitivities">
      <p className="text-xs text-glow-600 mb-3">
        Add ingredients that your skin reacts to. Products containing them will be flagged.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          className="input flex-1"
          placeholder="e.g. fragrance, lavender oil"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <select
          className="input w-auto"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as 'mild' | 'moderate' | 'severe')}
        >
          <option value="mild">mild</option>
          <option value="moderate">moderate</option>
          <option value="severe">severe</option>
        </select>
        <button className="btn-primary" onClick={add}>Add</button>
      </div>

      {(sensitivities?.length ?? 0) === 0 ? (
        <p className="text-sm text-glow-600/80">No sensitivities recorded yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {sensitivities!.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span>
                <span className="chip-danger mr-2">{s.ingredient}</span>
                <span className="text-xs text-glow-600">{s.severity}</span>
              </span>
              <button
                className="btn-ghost p-1 text-red-600"
                onClick={() => db.sensitivities.delete(s.id!)}
                aria-label={`Remove ${s.ingredient}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-glow-100 pt-3">
        <div className="text-xs font-semibold text-glow-700 mb-2">Common irritants flagged automatically</div>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_IRRITANTS.map((i) => (
            <span key={i.ingredient} className="chip-warn">{i.ingredient}</span>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-glow-800">{title}</h3>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
