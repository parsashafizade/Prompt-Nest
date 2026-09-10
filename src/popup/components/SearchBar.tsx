import { ChevronDown, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { TextDirection, Translator } from "../../shared/types";
import { BidiText } from "./BidiText";

export interface SearchFields {
  titles: boolean;
  content: boolean;
  notes: boolean;
}

interface SearchBarProps {
  value: string;
  fields: SearchFields;
  scopeName?: string;
  fallbackDirection: TextDirection;
  availableTags: string[];
  selectedTags: string[];
  favoritesOnly: boolean;
  onChange: (value: string) => void;
  onToggleField: (field: keyof SearchFields) => void;
  onToggleFavorite: () => void;
  onToggleTag: (tag: string) => void;
  t: Translator;
}

function SearchBarComponent({
  value,
  fields,
  scopeName,
  fallbackDirection,
  availableTags,
  selectedTags,
  favoritesOnly,
  onChange,
  onToggleField,
  onToggleFavorite,
  onToggleTag,
  t,
}: SearchBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const filtersChanged = !fields.titles || !fields.content || fields.notes || favoritesOnly || selectedTags.length > 0;

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!areaRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [filtersOpen]);

  return (
    <div className="search-area" onKeyDown={(event) => { if (event.key === "Escape") setFiltersOpen(false); }} ref={areaRef} role="search">
      <div className="search-wrap">
        <Search aria-hidden="true" className="search-icon" size={16} />
        <input
          aria-label={t("search")}
          className="search-input"
          onChange={(event) => onChange(event.target.value)}
          placeholder={scopeName ? t("searchFolder") : t("search")}
          type="search"
          value={value}
        />
        {value && (
          <button aria-label={t("close")} className="icon-button compact clear-search" onClick={() => onChange("")} type="button">
            <X aria-hidden="true" size={16} />
          </button>
        )}
      </div>
      <div className="search-meta">
        {scopeName && (
          <div className="search-scope">
            <span>{t("searchingIn")}</span>
            <BidiText fallbackDirection={fallbackDirection} text={scopeName} />
          </div>
        )}
        <div className="filter-menu-wrap">
          <button aria-expanded={filtersOpen} aria-haspopup="true" className={`filter-trigger ${filtersChanged ? "filters-active" : ""}`} onClick={() => setFiltersOpen((open) => !open)} type="button">
            <SlidersHorizontal aria-hidden="true" size={14} />
            <span>{t("filters")}</span>
            <ChevronDown aria-hidden="true" className={`sort-chevron ${filtersOpen ? "expanded" : ""}`} size={14} />
          </button>
          {filtersOpen && (
            <div aria-label={t("filters")} className="filter-menu">
              <div className="filter-menu-label">{t("searchFields")}</div>
              <div className="search-chips" aria-label={t("searchFields")} role="group">
                {(["titles", "content"] as const).map((field) => {
                  const locked = fields[field] && !fields[field === "titles" ? "content" : "titles"];
                  return (
                    <button
                      aria-pressed={fields[field]}
                      className="search-chip"
                      disabled={locked}
                      key={field}
                      onClick={() => onToggleField(field)}
                      type="button"
                    >
                      {field === "titles" ? t("titles") : t("contentFilter")}
                    </button>
                  );
                })}
                <button aria-pressed={fields.notes} className="search-chip" onClick={() => onToggleField("notes")} type="button">{t("searchNotes")}</button>
                <button aria-pressed={favoritesOnly} className="search-chip favorite-filter" onClick={onToggleFavorite} type="button"><Star aria-hidden="true" fill={favoritesOnly ? "currentColor" : "none"} size={12} /> {t("favorites")}</button>
              </div>
              {availableTags.length > 0 && (
                <>
                  <div className="filter-menu-label">{t("filterByTags")}</div>
                  <div className="tag-filter-row" aria-label={t("filterByTags")} role="group">
                    {availableTags.map((tag) => <button aria-pressed={selectedTags.includes(tag)} className="search-chip" key={tag} onClick={() => onToggleTag(tag)} type="button">{tag}</button>)}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const SearchBar = memo(SearchBarComponent);
