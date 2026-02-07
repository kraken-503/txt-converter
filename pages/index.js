import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState(null);
  const [paste, setPaste] = useState('');
  const [format, setFormat] = useState('pdf');
  const [targetKb, setTargetKb] = useState(80);
  const [loading, setLoading] = useState(false);

  async function postForm(url, formData) {
    const res = await fetch(url, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown' }));
      throw new Error(err.error || 'Request failed');
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="(.+)"/);
    a.download = match ? match[1] : 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  async function handleConvert(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('paste', paste);
      fd.append('format', format);
      await postForm('/api/convert', fd);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResize(e) {
    e.preventDefault();
    if (!file) return alert('Select an image file');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('targetKb', targetKb);
      await postForm('/api/resize', fd);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>File Converter & Image Resizer</h1>

      <section style={{ marginTop: 20 }}>
        <h2>Text conversion</h2>
        <form onSubmit={handleConvert}>
          <div>
            <label>Paste text</label>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} style={{ width: '100%' }} />
          </div>
          <div>
            <label>Or upload .txt</label>
            <input type="file" accept=".txt" onChange={(e) => setFile(e.target.files[0])} />
          </div>
          <div>
            <label>Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <button type="submit" disabled={loading}>Convert</button>
        </form>
      </section>

      <hr style={{ margin: '20px 0' }} />

      <section>
        <h2>Image resize (20–100 KB)</h2>
        <form onSubmit={handleResize}>
          <div>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
          </div>
          <div>
            <label>Target size KB</label>
            <input type="number" min="20" max="100" value={targetKb} onChange={(e) => setTargetKb(e.target.value)} />
          </div>
          <button type="submit" disabled={loading}>Resize</button>
        </form>
      </section>
    </main>
  );
}

