import { ArrowDownAZ, ArrowUpAZ, BarChart3, ChevronDown, Clock, GripVertical, History, type LucideIcon } from "lucide-react";
import { memo, useState } from "react";
import type { PromptSortMode, Translator } from "../../shared/types";

interface SortOption {
  value: PromptSortMode;
  label: string;
  icon: LucideIcon;
}

interface PromptSortMenuProps {
  value: PromptSortMode;
  onChange: (value: PromptSortMode) => void;
  t: Translator;
}

function PromptSortMenuComponent({ value, onChange, t }: PromptSortMenuProps) {
  const [open, setOpen] = useState(false);
  const options: SortOption[] = [
    { value: "newest", label: t("sortNewest"), icon: Clock },
    { value: "oldest", label: t("sortOldest"), icon: History },
    { value: "name-asc", label: t("sortNameAsc"), icon: ArrowDownAZ },
    { value: "name-desc", label: t("sortNameDesc"), icon: ArrowUpAZ },
    { value: "most-used", label: t("sortMostUsed"), icon: BarChart3 },
    { value: "custom", label: t("sortCustom"), icon: GripVertical },
  ];
  const selected = options.find((option) => option.value === value)!;
  const SelectedIcon = selected.icon;

  return (
    <div className="sort-wrap" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button aria-expanded={open} aria-haspopup="menu" className="sort-trigger" onClick={() => setOpen((current) => !current)} type="button">
        <SelectedIcon aria-hidden="true" size={16} />
        <span>{selected.label}</span>
        <ChevronDown aria-hidden="true" className={`sort-chevron ${open ? "expanded" : ""}`} size={16} />
      </button>
      {open && (
        <div className="sort-menu" role="menu">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                aria-checked={option.value === value}
                className="sort-option"
                key={option.value}
                onClick={() => { onChange(option.value); setOpen(false); }}
                role="menuitemradio"
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const PromptSortMenu = memo(PromptSortMenuComponent);
