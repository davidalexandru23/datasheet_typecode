import { useState, useEffect, useCallback } from 'react';
import './index.css';
import { loadAllSpecs } from './features/specs/spec-loader.js';
import { initRegistry, getAvailableFamilies } from './features/specs/spec-registry.js';
import { decodeTypecode } from './features/decode/decode-orchestrator.js';
import { exportPdf } from './lib/pdf/pdf-exporter.js';

function App() {
  const [specs, setSpecs] = useState([]);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [typecode, setTypecode] = useState('');
  const [decodeResult, setDecodeResult] = useState(null);
  const [sections, setSections] = useState([]);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({
    title: 'Fisa tehnica',
    date: new Date().toLocaleDateString('ro-RO'),
  });

  useEffect(() => {
    loadAllSpecs()
      .then(loaded => {
        initRegistry(loaded);
        setSpecs(getAvailableFamilies());
        setLoadStatus('ready');
      })
      .catch(err => {
        console.error('Failed to load specs:', err);
        setLoadStatus('error');
      });
  }, []);

  const handleDecode = useCallback(() => {
    if (!typecode.trim()) return;
    setError('');
    setDecodeResult(null);
    setSections([]);

    const result = decodeTypecode(typecode.trim());
    if (result.error) {
      setError(result.error);
      return;
    }

    setDecodeResult(result.decodeResult);
    setSections(result.sections);
    setMeta(m => ({
      ...m,
      typecode: result.decodeResult.raw_typecode,
      family: result.decodeResult.product_family,
    }));
  }, [typecode]);

  const toggleSection = useCallback((sectionId) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, visible: !s.visible } : s
    ));
  }, []);

  const toggleRow = useCallback((sectionId, rowId) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, rows: s.rows.map(r => r.id === rowId ? { ...r, visible: !r.visible } : r) }
        : s
    ));
  }, []);

  const handleExport = useCallback(() => {
    if (sections.length === 0) return;
    exportPdf(sections, meta);
  }, [sections, meta]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleDecode();
    }
  }, [handleDecode]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo">D</div>
          <div>
            <div className="app-header__title">Datasheet</div>
            <div className="app-header__subtitle">Product Type Code Decoder</div>
          </div>
        </div>
        <div className="app-header__status">
          <span className={`status-dot ${loadStatus === 'loading' ? 'status-dot--loading' : loadStatus === 'error' ? 'status-dot--error' : ''}`} />
          <span>
            {loadStatus === 'loading' && 'Loading specs...'}
            {loadStatus === 'ready' && `${specs.length} families loaded`}
            {loadStatus === 'error' && 'Failed to load specs'}
          </span>
        </div>
      </header>

      <div className="app-main">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Type Code Input */}
          <div className="card">
            <div className="card__header">
              <span className="card__title">Product Type Code</span>
            </div>
            <div className="card__body">
              <div className="input-group">
                <label className="input-group__label">Enter the full type code string</label>
                <input
                  id="typecode-input"
                  className="input-field"
                  type="text"
                  placeholder="e.g. FC-102P1K1T4A1XR1XAXXXX"
                  value={typecode}
                  onChange={e => setTypecode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loadStatus !== 'ready'}
                />
              </div>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <button
                  id="decode-btn"
                  className="btn btn--primary btn--full btn--lg"
                  onClick={handleDecode}
                  disabled={!typecode.trim() || loadStatus !== 'ready'}
                >
                  Generate Datasheet
                </button>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="error-message fade-in">
              <span>{error}</span>
            </div>
          )}

          {/* Removed info panels per user request to hide JSON/technical debug data */}
        </aside>

        {/* Main Content Area */}
        <main className="content-area">
          {sections.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div className="empty-state__title">No datasheet generated</div>
              <div className="empty-state__description">
                Enter a product type code and click "Generate Datasheet"
                to create a technical datasheet preview.
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="toolbar">
                <div className="toolbar__left">
                  <input
                    className="input-field"
                    style={{ width: 180 }}
                    value={meta.title}
                    onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
                    placeholder="Sheet title"
                  />
                  <input
                    className="input-field"
                    style={{ width: 110 }}
                    value={meta.date}
                    onChange={e => setMeta(m => ({ ...m, date: e.target.value }))}
                    placeholder="Date"
                  />
                </div>
                <div className="toolbar__right">
                  <button
                    id="export-pdf-btn"
                    className="btn btn--primary btn--lg"
                    onClick={handleExport}
                  >
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Datasheet Sections */}
              <div className="datasheet-preview fade-in">
                {sections.map(section => (
                  <div
                    key={section.id}
                    className={`section-block ${!section.visible ? 'section-block--hidden' : ''}`}
                  >
                    <div className="section-header">
                      <span className="section-header__title">
                        {section.title}
                      </span>
                      <div className="section-header__controls">
                        <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7 }}>
                          {section.rows.filter(r => r.visible).length}/{section.rows.length} rows
                        </span>
                        <button
                          className={`toggle ${section.visible ? 'toggle--active' : ''}`}
                          onClick={() => toggleSection(section.id)}
                          title={section.visible ? 'Hide section' : 'Show section'}
                        />
                      </div>
                    </div>
                    {section.visible && (
                      <table className="section-table">
                        <thead>
                          <tr>
                            <th className="col-nr">Nr.crt</th>
                            <th className="col-label">Caracteristici</th>
                            <th className="col-value">Valoare</th>
                            <th className="col-unit">Unitati</th>
                            <th className="col-actions"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map(row => (
                            <tr
                              key={row.id}
                              className={`${!row.visible ? 'row--hidden' : ''} ${row.isHeader ? 'row--section-header' : ''}`}
                            >
                              <td className="col-nr">{row.numbering}</td>
                              <td className={`col-label ${row.isHeader ? 'col-label--bold' : ''}`}>{row.label}</td>
                              <td className="col-value">{row.value}</td>
                              <td className="col-unit">{row.unit}</td>
                              <td className="col-actions">
                                {!row.isHeader && (
                                  <button
                                    className={`toggle ${row.visible ? 'toggle--active' : ''}`}
                                    onClick={() => toggleRow(section.id, row.id)}
                                    title={row.visible ? 'Hide row' : 'Show row'}
                                    style={{ transform: 'scale(0.8)' }}
                                  />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
