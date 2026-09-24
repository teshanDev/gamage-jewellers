import React, { useState, useEffect } from "react";
import { FileText, Download, Loader2, X, Trash2 } from "lucide-react";

export default function Documents({ token }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [file, setFile] = useState(null);

  const [selectedDocument, setSelectedDocument] = useState(null);

  const API_BASE = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/documents`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setFetching(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("category", category);

    try {
      const res = await fetch(`${API_BASE}/api/documents/upload`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      
      if (res.ok) {
        const newDoc = await res.json();
        setDocuments([newDoc, ...documents]);
        setTitle("");
        setFile(null);
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation(); // prevent modal opening
    if (!window.confirm("Are you sure you want to delete this document?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/documents/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setDocuments(documents.filter(doc => doc._id !== id));
      } else {
        const errData = await res.json();
        console.error("Delete failed:", errData.message);
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const isImage = (doc) => {
    return doc.fileType.startsWith("image/") || doc.fileUrl.match(/\.(jpeg|jpg|gif|png)$/i);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto h-full overflow-y-auto" style={{ color: "#f3efe6", background: "#1a1712", padding: 24, height: "100%", overflowY: "auto" }}>
      <h1 className="text-2xl font-bold mb-6" style={{ fontSize: 24, marginBottom: 24 }}>Documents</h1>

      {/* Upload Form */}
      <form onSubmit={handleUpload} className="bg-white p-5 rounded-lg shadow-sm border mb-8 flex flex-col md:flex-row gap-4 items-end" style={{ background: "#211d17", padding: 20, borderRadius: 8, border: "1px solid #3a342a", display: "flex", gap: 16, marginBottom: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="flex-1 w-full" style={{ flex: "1 1 200px" }}>
          <label className="block text-sm font-medium mb-1" style={{ display: "block", fontSize: 12, marginBottom: 8, color: "#9b9282" }}>Title</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded-md p-2"
            style={{ width: "100%", padding: "8px 10px", background: "#1a1712", border: "1px solid #3a342a", color: "#f3efe6", borderRadius: 6 }}
            placeholder="Document title"
            required
          />
        </div>
        <div className="w-full md:w-48" style={{ flex: "1 1 150px" }}>
          <label className="block text-sm font-medium mb-1" style={{ display: "block", fontSize: 12, marginBottom: 8, color: "#9b9282" }}>Category</label>
          <select 
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border rounded-md p-2"
            style={{ width: "100%", padding: "8px 10px", background: "#1a1712", border: "1px solid #3a342a", color: "#f3efe6", borderRadius: 6 }}
          >
            <option>General</option>
            <option>Invoices</option>
            <option>Receipts</option>
            <option>Contracts</option>
          </select>
        </div>
        <div className="flex-1 w-full" style={{ flex: "2 1 300px" }}>
          <label className="block text-sm font-medium mb-1" style={{ display: "block", fontSize: 12, marginBottom: 8, color: "#9b9282" }}>File</label>
          <style dangerouslySetInnerHTML={{__html: `
            .custom-file-input::-webkit-file-upload-button {
              background: transparent;
              border: 0;
              border-right: 1px solid #3a342a;
              color: #c9a227;
              margin-right: 16px;
              padding: 8px 16px;
              cursor: pointer;
            }
            .custom-file-input:hover::-webkit-file-upload-button {
              background: #1a1712;
            }
          `}} />
          <input 
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full border border-gray-700 rounded-md text-gray-300 file:bg-transparent file:border-0 file:border-r file:border-gray-700 file:text-yellow-500 file:mr-4 file:px-4 file:py-2 hover:file:bg-gray-800 transition-colors custom-file-input"
            style={{ width: "100%", background: "#1a1712", border: "1px solid #3a342a", borderRadius: 6, color: "#f3efe6" }}
            accept=".pdf,image/*"
            required
          />
        </div>
        <button 
          type="submit" 
          disabled={loading || !file}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-md font-medium flex items-center gap-2"
          style={{ padding: "10px 20px", background: "#c9a227", color: "#1a1712", border: "none", borderRadius: 6, fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer", opacity: (loading || !file) ? 0.5 : 1 }}
        >
          {loading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {/* Documents Grid */}
      {fetching ? (
        <div className="flex justify-center py-10" style={{ padding: 40, textAlign: "center", color: "#9b9282" }}>Loading...</div>
      ) : documents.length === 0 ? (
        <p className="text-center py-8" style={{ textAlign: "center", color: "#9b9282" }}>No documents uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
          {documents.map((doc) => (
            <div 
              key={doc._id} 
              onClick={() => setSelectedDocument(doc)}
              className="p-4 rounded-lg border flex flex-col cursor-pointer hover:border-yellow-500 transition-colors" 
              style={{ background: "#211d17", border: "1px solid #3a342a", borderRadius: 8, padding: 16, cursor: "pointer" }}
            >
              <div className="flex items-start justify-between mb-3" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <FileText style={{ color: "#c9a227" }} size={24} />
                <span className="text-xs px-2 py-1 rounded-full" style={{ fontSize: 11, background: "#1a1712", color: "#9b9282", padding: "4px 8px", borderRadius: 12 }}>
                  {doc.category}
                </span>
              </div>
              <h3 className="font-semibold truncate" style={{ fontSize: 16, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={doc.title}>{doc.title}</h3>
              <p className="text-xs mt-1 flex justify-between" style={{ fontSize: 12, color: "#9b9282", display: "flex", justifyContent: "space-between" }}>
                <span>{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
              </p>
              <div className="mt-4 pt-3 flex justify-end" style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid #3a342a" }}>
                <button 
                  onClick={(e) => handleDelete(e, doc._id)}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-red-500 transition-colors"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9b9282", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                  title="Delete Document"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {selectedDocument && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}
          onClick={() => setSelectedDocument(null)}
        >
          <div 
            className="bg-gray-900 rounded-lg overflow-hidden flex flex-col relative"
            style={{ background: "#211d17", borderRadius: 8, width: "100%", maxWidth: 900, height: "85vh", display: "flex", flexDirection: "column", border: "1px solid #3a342a" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-700" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: "1px solid #3a342a" }}>
              <h3 className="text-lg font-bold text-gray-100 truncate pr-4" style={{ fontSize: 18, fontWeight: "bold", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedDocument.title}
              </h3>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <a 
                  href={selectedDocument.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm text-yellow-500 transition-colors"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#1a1712", borderRadius: 4, color: "#c9a227", textDecoration: "none", fontSize: 14 }}
                >
                  <Download size={16} /> Download File
                </a>
                <button 
                  onClick={() => setSelectedDocument(null)}
                  className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9b9282", display: "flex" }}
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden bg-black flex items-center justify-center p-4" style={{ flex: 1, overflow: "hidden", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              {isImage(selectedDocument) ? (
                <img 
                  src={selectedDocument.fileUrl} 
                  alt={selectedDocument.title}
                  className="max-w-full max-h-full object-contain"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              ) : (
                <iframe 
                  src={selectedDocument.fileUrl} 
                  title={selectedDocument.title}
                  className="w-full h-full bg-white"
                  style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#fff" }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
