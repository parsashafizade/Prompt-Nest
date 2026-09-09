import { Search, X } from "lucide-react";
import { memo } from "react";
import type { TextDirection, Translator } from "../../shared/types";
import { BidiText } from "./BidiText";

export interface SearchFields {
  titles: boolean;
  content: boolean;
}

interface SearchBarProps {
  value: string;
  fields: SearchFields;
  scopeName?: string;
  fallbackDirection: TextDirection;
  onChange: (value: string) => void;
  onToggleField: (field: keyof SearchFields) => void;
  t: Translator;
}

function SearchBarComponent({
  value,
  fields,
  scopeName,
  fallbackDirection,
  onChange,
  onToggleField,
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
        </div>
        {scopeName && (
          <div className="search-scope">
            <span>{t("searchingIn")}</span>
            <BidiText fallbackDirection={fallbackDirection} text={scopeName} />
          </div>
        )}
      </div>
    </div>
  );
}

export const SearchBar = memo(SearchBarComponent);
