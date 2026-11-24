import { useState, type ChangeEvent } from 'react';
import { colorToCss, type Theme } from '../core/render/aci';
import type { LayerInfo } from '../core/scene/scene';
import { formatCount } from '../i18n/format';
import type { Strings } from '../i18n/strings';

interface Props {
  layers: readonly LayerInfo[];
  hidden: ReadonlySet<string>;
  theme: Theme;
  t: Strings;
  onToggle: (name: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

/** قائمة الطبقات: إظهار/إخفاء كل طبقة، ولونها، وعدد عناصرها. */
export function LayerPanel({ layers, hidden, theme, t, onToggle, onShowAll, onHideAll }: Props) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = needle ? layers.filter((l) => l.name.toLowerCase().includes(needle)) : layers;

  if (layers.length === 0) return <p className="muted pad">{t.layersEmpty}</p>;

  return (
    <div className="layer-panel">
      <div className="layer-actions">
        <button type="button" className="btn small" onClick={onShowAll} data-testid="layers-show-all">
          {t.showAll}
        </button>
        <button type="button" className="btn small" onClick={onHideAll} data-testid="layers-hide-all">
          {t.hideAll}
        </button>
      </div>
      {layers.length > 8 && (
        <input
          type="search"
          className="search"
          value={query}
          placeholder={t.searchLayers}
          aria-label={t.searchLayers}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.currentTarget.value)}
        />
      )}
      <ul className="layer-list">
        {shown.map((layer) => (
          <li key={layer.name}>
            <label className="layer-row" data-empty={layer.count === 0} data-testid="layer-row">
              <input
                type="checkbox"
                checked={!hidden.has(layer.name)}
                onChange={() => onToggle(layer.name)}
                aria-label={layer.name}
              />
              <span className="swatch" style={{ background: colorToCss(layer.color, theme) }} />
              <span className="layer-name" dir="auto">
                {layer.name}
              </span>
              <span className="layer-count">{formatCount(layer.count)}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
