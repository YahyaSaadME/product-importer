"use client";

import {
  CheckCircle2,
  CircleAlert,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_BASE, ImportJob, Product, ProductPage, Webhook, apiFetch } from "../lib/api";

const events = ["products.imported", "product.created", "product.updated", "product.deleted", "products.cleared"];

type ProductDraft = {
  sku: string;
  name: string;
  description: string;
  is_active: boolean;
};

const emptyProduct: ProductDraft = { sku: "", name: "", description: "", is_active: true };

export default function Home() {
  const [products, setProducts] = useState<ProductPage>({ items: [], total: 0, page: 1, page_size: 25 });
  const [filters, setFilters] = useState({ sku: "", name: "", description: "", status: "" });
  const [page, setPage] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [editing, setEditing] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [webhookDraft, setWebhookDraft] = useState({ url: "", events: ["products.imported"], enabled: true });
  const [testingWebhook, setTestingWebhook] = useState<number | null>(null);

  const importProgress = useMemo(() => {
    if (!importJob || importJob.total_rows === 0) return importJob?.status === "complete" ? 100 : 0;
    return Math.min(100, Math.round((importJob.processed_rows / importJob.total_rows) * 100));
  }, [importJob]);

  async function loadProducts(nextPage = page) {
    setLoadingProducts(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(nextPage),
      page_size: "25"
    });
    if (filters.sku) params.set("sku", filters.sku);
    if (filters.name) params.set("name", filters.name);
    if (filters.description) params.set("description", filters.description);
    if (filters.status) params.set("is_active", filters.status);

    try {
      setProducts(await apiFetch<ProductPage>(`/products?${params}`));
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products.");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadWebhooks() {
    try {
      setWebhooks(await apiFetch<Webhook[]>("/webhooks"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load webhooks.");
    }
  }

  useEffect(() => {
    loadProducts(1);
    loadWebhooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!importJob || ["complete", "failed"].includes(importJob.status)) return;
    const timer = window.setInterval(async () => {
      const next = await apiFetch<ImportJob>(`/imports/${importJob.id}`);
      setImportJob(next);
      if (next.status === "complete") {
        setToast("Import complete.");
        loadProducts(1);
      }
    }, 1200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJob?.id, importJob?.status]);

  function uploadCsv(file: File) {
    setUploading(true);
    setError(null);
    setUploadPercent(0);
    const data = new FormData();
    data.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE}/imports`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setUploadPercent(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      setUploading(false);
      if (request.status >= 200 && request.status < 300) {
        setImportJob(JSON.parse(request.responseText));
        setToast("Upload finished. Import queued.");
      } else {
        setError(request.responseText || "Upload failed.");
      }
    };
    request.onerror = () => {
      setUploading(false);
      setError("Upload failed. Check that the API is reachable.");
    };
    request.send(data);
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    const path = editing ? `/products/${editing.id}` : "/products";
    const method = editing ? "PUT" : "POST";
    try {
      await apiFetch<Product>(path, { method, body: JSON.stringify(productDraft) });
      setToast(editing ? "Product updated." : "Product created.");
      setEditing(null);
      setProductDraft(emptyProduct);
      loadProducts(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save product.");
    }
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`Delete product ${product.sku}?`)) return;
    await apiFetch<void>(`/products/${product.id}`, { method: "DELETE", headers: {} });
    setToast("Product deleted.");
    loadProducts(page);
  }

  async function clearProducts() {
    if (clearConfirm !== "DELETE") return;
    await apiFetch<void>("/products", { method: "DELETE", headers: {} });
    setToast("All products deleted.");
    setClearConfirm("");
    loadProducts(1);
  }

  async function saveWebhook(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch<Webhook>("/webhooks", { method: "POST", body: JSON.stringify(webhookDraft) });
      setWebhookDraft({ url: "", events: ["products.imported"], enabled: true });
      setToast("Webhook saved.");
      loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save webhook.");
    }
  }

  async function deleteWebhook(id: number) {
    if (!window.confirm("Delete this webhook?")) return;
    await apiFetch<void>(`/webhooks/${id}`, { method: "DELETE", headers: {} });
    loadWebhooks();
  }

  async function testWebhook(id: number) {
    setTestingWebhook(id);
    try {
      const result = await apiFetch<{ status_code: number | null; response_ms: number; ok: boolean }>(
        `/webhooks/${id}/test`,
        { method: "POST", body: "{}" }
      );
      setToast(`Webhook test ${result.ok ? "succeeded" : "finished"} in ${result.response_ms}ms.`);
      loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Webhook test failed.");
    } finally {
      setTestingWebhook(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Product Importer</h1>
          <p>Upload large CSV files, manage products, and monitor outbound webhooks.</p>
        </div>
        <button className="ghost-button" onClick={() => loadProducts(page)} disabled={loadingProducts}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {(toast || error) && (
        <div className={`notice ${error ? "error" : "success"}`}>
          {error ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
          <span>{error || toast}</span>
          <button onClick={() => (error ? setError(null) : setToast(null))} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="grid two">
        <div className="panel">
          <div className="panel-heading">
            <h2>CSV Upload</h2>
            <span>Up to 500,000 rows</span>
          </div>
          <label className="dropzone">
            <Upload size={26} />
            <strong>{uploading ? "Uploading..." : "Choose CSV file"}</strong>
            <span>SKU is required. Name and description are optional.</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => event.target.files?.[0] && uploadCsv(event.target.files[0])}
            />
          </label>
          <Progress label="Network upload" value={uploadPercent} />
          <Progress label={importJob?.stage || "Waiting for import"} value={importProgress} />
          {importJob && (
            <div className="job-row">
              <span>{importJob.filename}</span>
              <strong className={importJob.status}>{importJob.status}</strong>
              <span>
                {importJob.processed_rows.toLocaleString()} / {importJob.total_rows.toLocaleString()} rows
              </span>
              {importJob.error && <span className="danger">{importJob.error}</span>}
            </div>
          )}
        </div>

        <div className="panel danger-zone">
          <div className="panel-heading">
            <h2>Clear Everything</h2>
            <span>Requires confirmation</span>
          </div>
          <p>Delete all product records while keeping import history and webhook settings intact.</p>
          <div className="inline-action">
            <input
              placeholder="Type DELETE"
              value={clearConfirm}
              onChange={(event) => setClearConfirm(event.target.value)}
            />
            <button className="danger-button" disabled={clearConfirm !== "DELETE"} onClick={clearProducts}>
              <Trash2 size={16} />
              Clear all
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading with-action">
          <div>
            <h2>Products</h2>
            <span>{products.total.toLocaleString()} records</span>
          </div>
          <form className="filters" onSubmit={(event) => { event.preventDefault(); loadProducts(1); }}>
            <input placeholder="SKU" value={filters.sku} onChange={(event) => setFilters({ ...filters, sku: event.target.value })} />
            <input placeholder="Name" value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} />
            <input placeholder="Description" value={filters.description} onChange={(event) => setFilters({ ...filters, description: event.target.value })} />
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Any status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <button>
              <Search size={16} />
              Filter
            </button>
          </form>
        </div>

        <form className="product-form" onSubmit={saveProduct}>
          <input placeholder="SKU" value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value })} required />
          <input placeholder="Name" value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} required />
          <input placeholder="Description" value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} />
          <label className="toggle">
            <input type="checkbox" checked={productDraft.is_active} onChange={(event) => setProductDraft({ ...productDraft, is_active: event.target.checked })} />
            Active
          </label>
          <button>
            <Plus size={16} />
            {editing ? "Save" : "Add"}
          </button>
          {editing && (
            <button type="button" className="ghost-button" onClick={() => { setEditing(null); setProductDraft(emptyProduct); }}>
              Cancel
            </button>
          )}
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {products.items.map((product) => (
                <tr key={product.id}>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td>{product.description || "No description"}</td>
                  <td><span className={product.is_active ? "status active" : "status inactive"}>{product.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="row-actions">
                    <button className="ghost-button" onClick={() => { setEditing(product); setProductDraft({ sku: product.sku, name: product.name, description: product.description, is_active: product.is_active }); }}>
                      Edit
                    </button>
                    <button className="icon-danger" onClick={() => removeProduct(product)} aria-label={`Delete ${product.sku}`}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {products.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">No products match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <button disabled={page === 1} onClick={() => loadProducts(page - 1)}>Previous</button>
          {(() => {
            const totalPages = Math.ceil(products.total / products.page_size) || 1;
            const startRow = products.total === 0 ? 0 : (page - 1) * products.page_size + 1;
            const endRow = Math.min(page * products.page_size, products.total);
            return (
              <>
                <span>
                  Page {page} of {totalPages} | Rows {startRow}-{endRow} of {products.total}
                </span>
              </>
            );
          })()}
          <button disabled={page * products.page_size >= products.total} onClick={() => loadProducts(page + 1)}>Next</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Webhooks</h2>
          <span>Background event delivery</span>
        </div>
        <form className="webhook-form" onSubmit={saveWebhook}>
          <input placeholder="https://example.com/webhook" value={webhookDraft.url} onChange={(event) => setWebhookDraft({ ...webhookDraft, url: event.target.value })} required />
          <div className="event-list">
            {events.map((eventName) => (
              <label key={eventName}>
                <input
                  type="checkbox"
                  checked={webhookDraft.events.includes(eventName)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...webhookDraft.events, eventName]
                      : webhookDraft.events.filter((item) => item !== eventName);
                    setWebhookDraft({ ...webhookDraft, events: next });
                  }}
                />
                {eventName}
              </label>
            ))}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={webhookDraft.enabled} onChange={(event) => setWebhookDraft({ ...webhookDraft, enabled: event.target.checked })} />
            Enabled
          </label>
          <button>
            <Plus size={16} />
            Add webhook
          </button>
        </form>
        <div className="webhook-list">
          {webhooks.map((webhook) => (
            <div className="webhook-row" key={webhook.id}>
              <div>
                <strong>{webhook.url}</strong>
                <span>{webhook.events.join(", ")}</span>
                <small>
                  {webhook.last_status_code ? `Last ${webhook.last_status_code} in ${webhook.last_response_ms}ms` : webhook.last_error || "Not tested yet"}
                </small>
              </div>
              <span className={webhook.enabled ? "status active" : "status inactive"}>{webhook.enabled ? "Enabled" : "Paused"}</span>
              <button className="ghost-button" onClick={() => testWebhook(webhook.id)} disabled={testingWebhook === webhook.id}>
                <Play size={16} />
                Test
              </button>
              <button className="icon-danger" onClick={() => deleteWebhook(webhook.id)} aria-label="Delete webhook">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="progress">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
