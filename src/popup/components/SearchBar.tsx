import { Search, Star, X } from "lucide-react";
import { memo } from "react";
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
  return (
    <div className="search-area" role="search">
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
        {scopeName && (
          <div className="search-scope">
            <span>{t("searchingIn")}</span>
            <BidiText fallbackDirection={fallbackDirection} text={scopeName} />
          </div>
        )}
      </div>
      {availableTags.length > 0 && (
        <div className="tag-filter-row" aria-label={t("filterByTags")} role="group">
          {availableTags.map((tag) => <button aria-pressed={selectedTags.includes(tag)} className="search-chip" key={tag} onClick={() => onToggleTag(tag)} type="button">{tag}</button>)}
        </div>
      )}
    </div>
  );
}

export const SearchBar = memo(SearchBarComponent);
