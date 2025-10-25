import React, { useState } from 'react';
import './App.css';
import { parseHeadings, chunkMarkdown } from './chunker';
import * as XLSX from 'xlsx';

function App() {
  const [activeComponent, setActiveComponent] = useState(null);
  const [markdownResult, setMarkdownResult] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chunkResult, setChunkResult] = useState(null);
  const [definitionsData, setDefinitionsData] = useState(null);
  const [glossaryData, setGlossaryData] = useState(null);
  const [glossaryView, setGlossaryView] = useState(null);
  const [buildProgress, setBuildProgress] = useState(null);
  const [buildError, setBuildError] = useState(null);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [availableTerms, setAvailableTerms] = useState([]);

  const handleConvertToMarkdown = () => {
    setActiveComponent('markdown');
  };

  const handleChunk = () => {
    setActiveComponent('chunk');
  };

  const handleManageDefinitions = () => {
    setActiveComponent('definitions');
  };

  const handleManageGlossaries = () => {
    setActiveComponent('glossaries');
    setGlossaryView(null); // Reset glossary view when entering glossary section
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Prompt for heading levels after file is selected
    let input = window.prompt(
      'Enter heading prefixes and levels as comma-separated pairs (e.g. Chapter:1,Article:2,Annex:3):',
      'Chapter:1,Article:2,Annex:3'
    );
    
    // Proceed even if input is empty
    const headingMap = {};
    if (input) {
      // Parse heading map
      input.split(',').forEach(pair => {
        let [prefix, level] = pair.split(':').map(s => s.trim());
        if (prefix && level) headingMap[prefix] = parseInt(level);
      });
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('headingMap', JSON.stringify(headingMap));

      const response = await fetch('http://localhost:5000/convert-to-markdown', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Conversion failed');
      }

      const result = await response.json();
      setMarkdownResult(result.markdown);
      
      // Download the markdown file
      const blob = new Blob([result.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChunkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Prompt user for chunking heading level
    let chunkLevel = window.prompt(
      'Enter heading level to chunk by (e.g. 1 for #, 2 for ##, 3 for ###):',
      '2'
    );
    if (!chunkLevel || isNaN(chunkLevel)) return;
    chunkLevel = parseInt(chunkLevel);

    setLoading(true);
    setError(null);

    try {
    const reader = new FileReader();
    reader.onload = function(event) {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const filename = file.name.replace(/\.[^.]+$/, '');
      const headings = parseHeadings(lines);
        
      if (headings.length === 0) {
        const proceed = window.confirm('No headings detected. The whole file will be a single chunk. Proceed?');
          if (!proceed) {
            setLoading(false);
            return;
          }
      }

      const chunks = chunkMarkdown(lines, headings, chunkLevel, filename);
        setChunkResult(chunks);

      // Create a zip of all chunks
      if (chunks.length === 1) {
        // Only one chunk, just download it
        const chunk = chunks[0];
        const content = `# ${chunk.name}\n\n` + lines.slice(chunk.start, chunk.end).join('\n');
        const blob = new Blob([content], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${chunk.name.replace(/,|\s+/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      } else {
        // Multiple chunks: create a zip
        import('jszip').then(JSZipModule => {
          const JSZip = JSZipModule.default || JSZipModule;
          const zip = new JSZip();
          for (const chunk of chunks) {
            const content = `# ${chunk.name}\n\n` + lines.slice(chunk.start, chunk.end).join('\n');
            const fname = `${chunk.name.replace(/,|\s+/g, '_')}.md`;
            zip.file(fname, content);
          }
          zip.generateAsync({ type: 'blob' }).then(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${filename}_chunks.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
          });
        });
      }
        setLoading(false);
    };
    reader.readAsText(file);
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleDefinitionsUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const data = event.target.result;
          let jsonData;

          if (file.name.endsWith('.csv')) {
            // Handle CSV
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          } else if (file.name.endsWith('.xlsx')) {
            // Handle XLSX
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          } else {
            throw new Error('Unsupported file format. Please upload a CSV or XLSX file.');
          }

          if (jsonData.length < 2) {
            throw new Error('File must contain at least a header row and one data row.');
          }

          // Extract headers and data
          const headers = jsonData[0];
          const rows = jsonData.slice(1);

          setDefinitionsData({
            headers,
            rows,
            filename: file.name
          });
        } catch (error) {
          setError(error.message);
        } finally {
          setLoading(false);
        }
      };
      reader.onerror = () => {
        setError('Error reading file');
        setLoading(false);
      };

      if (file.name.endsWith('.csv')) {
        reader.readAsBinaryString(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleGlossaryUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:5000/process-glossary', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process glossary');
      }

      const result = await response.json();
      
      // Extract available terms from key_terms column
      const terms = new Set();
      result.rows.forEach(row => {
        const keyTermsIndex = result.headers.indexOf('key_terms');
        if (keyTermsIndex !== -1) {
          const keyTerms = row[keyTermsIndex];
          if (keyTerms) {
            keyTerms.split(';').forEach(term => {
              const [termName] = term.split('||');
              if (termName) {
                terms.add(termName.trim());
              }
            });
          }
        }
      });
      
      setAvailableTerms(Array.from(terms).sort());
      setGlossaryData({
        headers: result.headers,
        rows: result.rows,
        filename: file.name
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getTermScore = (keyTerms, term) => {
    if (!keyTerms) return 0;
    const termEntry = keyTerms.split(';').find(t => t.trim().startsWith(term + '||'));
    if (!termEntry) return 0;
    const score = parseFloat(termEntry.split('||')[1]);
    return isNaN(score) ? 0 : score;
  };

  const getSortedRows = () => {
    if (!glossaryData || !selectedTerm) return glossaryData.rows;
    
    const keyTermsIndex = glossaryData.headers.indexOf('key_terms');
    if (keyTermsIndex === -1) return glossaryData.rows;

    return [...glossaryData.rows].sort((a, b) => {
      const scoreA = getTermScore(a[keyTermsIndex], selectedTerm);
      const scoreB = getTermScore(b[keyTermsIndex], selectedTerm);
      return scoreB - scoreA; // Sort in descending order
    });
  };

  const handleBuildGlossary = async (e) => {
    const zipFile = e.target.files[0];
    if (!zipFile) return;

    if (!definitionsData) {
      setBuildError('Please upload a definitions file first');
      return;
    }

    setLoading(true);
    setBuildProgress('Building glossary...');
    setBuildError(null);

    try {
      const formData = new FormData();
      formData.append('zip_file', zipFile);
      
      // Create a temporary file from the definitions data
      const definitionsBlob = new Blob([
        definitionsData.headers.join(',') + '\n' +
        definitionsData.rows.map(row => row.join(',')).join('\n')
      ], { type: 'text/csv' });
      
      formData.append('definitions_file', definitionsBlob, 'definitions.csv');

      const response = await fetch('http://localhost:5000/build-glossary', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to build glossary');
      }

      const result = await response.json();
      setBuildProgress('Glossary built successfully!');
      
      // Download the results file
      try {
        const downloadResponse = await fetch(`http://localhost:5000/download/${result.output_file}`);
        if (downloadResponse.ok) {
          const blob = await downloadResponse.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.output_file;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } else {
          throw new Error('Failed to download results file');
        }
      } catch (downloadError) {
        setBuildError(`Results saved but download failed: ${downloadError.message}`);
      }
    } catch (error) {
      setBuildError(error.message);
    } finally {
      setLoading(false);
      setTimeout(() => {
        setBuildProgress(null);
      }, 3000);
    }
  };

  const renderContent = () => {
    switch (activeComponent) {
      case 'markdown':
  return (
          <div className="markdown-converter">
            <h2>Convert to Markdown</h2>
            <div className="upload-section">
              <input
                type="file"
                accept=".pdf,.html,.htm,.txt,application/pdf,text/html,text/plain"
                id="file-upload"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                className="upload-button"
                onClick={() => document.getElementById('file-upload').click()}
                disabled={loading}
              >
                {loading ? 'Converting...' : 'Upload and Convert'}
              </button>
            </div>
            {error && <div className="error-message">{error}</div>}
            {markdownResult && (
              <div className="preview-section">
                <h3>Preview:</h3>
                <pre className="markdown-preview">{markdownResult}</pre>
              </div>
            )}
          </div>
        );
      case 'chunk':
        return (
          <div className="chunk-converter">
            <h2>Chunk Markdown File</h2>
            <div className="upload-section">
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                id="chunk-upload"
                onChange={handleChunkUpload}
                style={{ display: 'none' }}
              />
              <button
                className="upload-button"
                onClick={() => document.getElementById('chunk-upload').click()}
                disabled={loading}
              >
                {loading ? 'Chunking...' : 'Upload and Chunk'}
              </button>
            </div>
            {error && <div className="error-message">{error}</div>}
            {chunkResult && (
              <div className="preview-section">
                <h3>Chunks Preview:</h3>
                <div className="chunks-preview">
                  {chunkResult.map((chunk, index) => (
                    <div key={index} className="chunk-item">
                      <h4>{chunk.name}</h4>
                      <p>Lines: {chunk.start + 1} - {chunk.end}</p>
                      <p>Type: {chunk.isAnnex ? 'Annex' : 'Regular'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'definitions':
        return (
          <div className="definitions-manager">
            <h2>Manage Definitions</h2>
            <div className="upload-section">
              <input
                type="file"
                accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                id="definitions-upload"
                onChange={handleDefinitionsUpload}
                style={{ display: 'none' }}
              />
              <div className="button-group">
                <button
                  className="upload-button"
                  onClick={() => document.getElementById('definitions-upload').click()}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Upload definitions file'}
                </button>
                <button
                  className="upload-button change-button"
                  onClick={() => document.getElementById('definitions-upload').click()}
                  disabled={loading}
                >
                  Change definitions file
                </button>
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            {definitionsData && (
              <div className="definitions-preview">
                <h3>Definitions Table</h3>
                <div className="table-container">
                  <table className="definitions-table">
                  <thead>
                    <tr>
                        {definitionsData.headers.map((header, index) => (
                          <th key={index}>{header}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                      {definitionsData.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        );
      case 'glossaries':
        return (
          <div className="glossary-manager">
            <h2>Manage Glossaries</h2>
            <div className="glossary-buttons">
              <button
                className="glossary-button build-button"
                onClick={() => setGlossaryView('build')}
              >
                Build glossary
              </button>
          <button
                className="glossary-button view-button"
                onClick={() => setGlossaryView('view')}
              >
                View glossary
          </button>
            </div>
            {glossaryView === 'build' && (
              <div className="build-glossary-section">
                <h3>Build Glossary</h3>
                {!definitionsData && (
                  <div className="warning-message">
                    Please upload a definitions file first using the "View glossary" section
                  </div>
                )}
                <div className="upload-section">
                  <input
                    type="file"
                    accept=".zip"
                    id="glossary-build-upload"
                    onChange={handleBuildGlossary}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="upload-button"
                    onClick={() => document.getElementById('glossary-build-upload').click()}
                    disabled={loading || !definitionsData}
                  >
                    {loading ? 'Processing...' : 'Upload ZIP file'}
                  </button>
                </div>
                {buildError && <div className="error-message">{buildError}</div>}
                {buildProgress && (
                  <div className="progress-message">
                    {buildProgress}
                  </div>
                )}
              </div>
            )}
            {glossaryView === 'view' && (
              <div className="view-glossary-section">
                <h3>View Glossary</h3>
                <div className="upload-section">
          <input
            type="file"
                    accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    id="glossary-upload"
                    onChange={handleGlossaryUpload}
            style={{ display: 'none' }}
          />
          <button
                    className="upload-button"
                    onClick={() => document.getElementById('glossary-upload').click()}
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Upload glossary file'}
          </button>
        </div>
                {error && <div className="error-message">{error}</div>}
                {glossaryData && (
                  <div className="glossary-preview">
                    <h4>Glossary Preview</h4>
                    <div className="sort-controls">
                      <label htmlFor="term-select">Sort by term: </label>
                      <select
                        id="term-select"
                        value={selectedTerm}
                        onChange={(e) => setSelectedTerm(e.target.value)}
                        className="term-select"
                      >
                        <option value="">Select a term</option>
                        {availableTerms.map((term, index) => (
                          <option key={index} value={term}>{term}</option>
                        ))}
                      </select>
                    </div>
                    <div className="table-container">
                      <table className="glossary-table">
                        <thead>
                          <tr>
                            {glossaryData.headers.map((header, index) => (
                              <th key={index}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {getSortedRows().map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      default:
        return <h1 style={{ 
          textAlign: 'center', 
          fontSize: '2.5rem', 
          margin: '2rem 0',
          color: '#2c3e50',
          fontWeight: 'bold'
        }}>Welcome to Poli-Golly, a quick glossary builder for policy documents</h1>;
    }
  };

  // Add CSS for rotating icon
  const rotatingIconStyle = {
    display: 'inline-block',
    width: '24px',
    height: '24px',
    border: '3px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '50%',
    borderTopColor: '#000',
    animation: 'spin 1s linear infinite',
  };

  // Add keyframes for spin animation
  const styleSheet = document.styleSheets[0];
  styleSheet.insertRule(`
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  `, styleSheet.cssRules.length);

  // Update CSS for rotating icon to center it
  const rotatingIconContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '10px', // Add some space below the button
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Poli-Golly</h1>
        <nav>
          <button onClick={handleConvertToMarkdown}>Convert to markdown</button>
          <button onClick={handleChunk}>Chunk</button>
          <button onClick={handleManageDefinitions}>Manage definitions</button>
          <button onClick={handleManageGlossaries}>Manage glossaries</button>
        </nav>
      </header>
      <main className="app-content">
        {renderContent()}
        {loading && (
          <div style={rotatingIconContainerStyle}>
            <div style={rotatingIconStyle}></div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
