import React, { useEffect, useMemo, useState } from "react";

type MediaType = "movie" | "book";

type MovieHit = {
  id: string; // imdbID
  title: string;
  year?: string;
  poster?: string;
  type: "movie";
};

type BookHit = {
  id: string; // volumeId
  title: string;
  authors?: string;
  year?: string;
  poster?: string;
  type: "book";
};

type Hit = MovieHit | BookHit;

type MovieDetails = {
  Title: string; Year?: string; Genre?: string; Plot?: string; Runtime?: string;
  Director?: string; Actors?: string; Poster?: string; imdbRating?: string;
};

type BookDetails = {
  title: string; authors?: string; publishedDate?: string; description?: string;
  pageCount?: number; categories?: string[]; image?: string; previewLink?: string;
};

const OMDB_KEY = import.meta.env.VITE_OMDB_KEY as string | undefined;

const STORAGE_KEY = "mbf_favorites_v1";

function useLocalFavorites() {
  const [favs, setFavs] = useState<Hit[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Hit[]) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  }, [favs]);

  const isFav = (id: string) => favs.some(f => f.id === id);
  const toggle = (item: Hit) => {
    setFavs(prev => prev.some(f => f.id === item.id) ? prev.filter(f => f.id !== item.id) : [item, ...prev]);
  };

  return { favs, isFav, toggle, setFavs };
}

async function searchMovies(q: string, page = 1): Promise<MovieHit[]> {
  if (!OMDB_KEY) throw new Error("Missing OMDb API key. Add VITE_OMDB_KEY in .env");
  const url = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&s=${encodeURIComponent(q)}&type=movie&page=${page}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Response === "False") return [];
  return (data.Search || []).map((m: any) => ({
    id: m.imdbID,
    title: m.Title,
    year: m.Year,
    poster: m.Poster !== "N/A" ? m.Poster : undefined,
    type: "movie" as const,
  }));
}

async function getMovieDetails(id: string): Promise<MovieDetails | null> {
  if (!OMDB_KEY) return null;
  const url = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${id}&plot=full`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Response === "False") return null;
  return data as MovieDetails;
}

async function searchBooks(q: string, page = 1): Promise<BookHit[]> {
  const startIndex = (page - 1) * 20;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&printType=books&startIndex=${startIndex}&maxResults=20`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items) return [];
  return data.items.map((v: any) => {
    const info = v.volumeInfo || {};
    const img = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
    return {
      id: v.id,
      title: info.title,
      authors: Array.isArray(info.authors) ? info.authors.join(", ") : undefined,
      year: (info.publishedDate || "").slice(0, 4),
      poster: img,
      type: "book" as const,
    };
  });
}

async function getBookDetails(id: string): Promise<BookDetails | null> {
  const url = `https://www.googleapis.com/books/v1/volumes/${id}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const info = data.volumeInfo || {};
  return {
    title: info.title,
    authors: Array.isArray(info.authors) ? info.authors.join(", ") : undefined,
    publishedDate: info.publishedDate,
    description: info.description,
    pageCount: info.pageCount,
    categories: info.categories,
    image: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail,
    previewLink: info.previewLink,
  };
}

export default function App() {
  const [media, setMedia] = useState<MediaType>("movie");
  const [tab, setTab] = useState<"results" | "favorites">("results");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<MovieDetails | BookDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const { favs, isFav, toggle } = useLocalFavorites();

  const canSearch = q.trim().length >= 2;

  const placeholder = useMemo(
    () => (media === "movie" ? "Search movies (e.g., Interstellar)" : "Search books (e.g., Atomic Habits)"),
    [media]
  );

  async function runSearch() {
    if (!canSearch) return;
    setLoading(true); setError(null);
    try {
      const results = media === "movie" ? await searchMovies(q.trim(), 1) : await searchBooks(q.trim(), 1);
      setHits(results);
      setTab("results");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(item: Hit) {
    setOpenId(item.id);
    setDetails(null);
    setDetailsLoading(true);
    try {
      const d = item.type === "movie" ? await getMovieDetails(item.id) : await getBookDetails(item.id);
      setDetails(d);
    } finally {
      setDetailsLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div className="brand">🎬📚 Movie/Book Finder</div>
        <div className="pill" role="tablist" aria-label="Media toggle">
          <button className={`tab ${media === "movie" ? "active" : ""}`} onClick={() => setMedia("movie")}>
            Movies
          </button>
          <button className={`tab ${media === "book" ? "active" : ""}`} onClick={() => setMedia("book")}>
            Books
          </button>
        </div>

        <div className="pill" role="tablist" aria-label="View toggle">
          <button className={`tab ${tab === "results" ? "active" : ""}`} onClick={() => setTab("results")}>
            Results
          </button>
          <button className={`tab ${tab === "favorites" ? "active" : ""}`} onClick={() => setTab("favorites")}>
            Favorites ({favs.length})
          </button>
        </div>
      </div>

      <div className="searchbar">
        <input
          className="input"
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button className={`btn primary`} onClick={runSearch} disabled={!canSearch || loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {!OMDB_KEY && media === "movie" && (
        <div className="empty">
          <strong>Heads up:</strong> OMDb API key missing. Add <code>VITE_OMDB_KEY</code> in <code>.env</code> to search movies.
        </div>
      )}

      {error && <div className="empty">⚠️ {error}</div>}

      {tab === "results" && (
        hits.length ? (
          <div className="grid">
            {hits.map((h) => (
              <div className="card" key={h.id}>
                <img className="poster" src={h.poster || `https://placehold.co/400x600?text=${h.type}`} alt={h.title} />
                <div className="item">
                  <div className="title">{h.title}</div>
                  <div className="bar">
                    <div className="meta">{h.type === "movie" ? h.year : h.authors || "Unknown author"}</div>
                    <div className="row">
                      <span className="badge">{h.type.toUpperCase()}</span>
                      {h.year && <span className="badge">{h.year}</span>}
                    </div>
                  </div>
                  <div className="bar">
                    <button className="btn" onClick={() => openDetails(h)}>Details</button>
                    <button className={`btn ${isFav(h.id) ? "warn" : ""}`} onClick={() => toggle(h)}>
                      {isFav(h.id) ? "Remove Favorite" : "Add Favorite"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            Start with a search ↑ <br /> Try: <span className="linklike" onClick={() => setQ("interstellar")}>interstellar</span> or{" "}
            <span className="linklike" onClick={() => setQ("harry potter")}>harry potter</span>
          </div>
        )
      )}

      {tab === "favorites" && (
        favs.length ? (
          <div className="grid">
            {favs.map((h) => (
              <div className="card" key={h.id}>
                <img className="poster" src={h.poster || `https://placehold.co/400x600?text=${h.type}`} alt={h.title} />
                <div className="item">
                  <div className="title">{h.title}</div>
                  <div className="meta">
                    {h.type === "movie" ? h.year : (h.authors || "Unknown author")} {h.year ? `• ${h.year}` : ""}
                  </div>
                  <div className="bar">
                    <button className="btn" onClick={() => openDetails(h)}>Details</button>
                    <button className="btn warn" onClick={() => toggle(h)}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">No favorites yet. Add from results!</div>
        )
      )}

      {openId && (
        <div className="modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="btn close" onClick={() => setOpenId(null)}>✕</button>
            {/* Left */}
            <img
              className="poster"
              src={
                (details as any)?.Poster ||
                (details as any)?.image ||
                `https://placehold.co/400x600?text=${media}`
              }
              alt="poster"
            />
            {/* Right */}
            <div style={{ display: "grid", gap: 10 }}>
              {detailsLoading && <div className="empty">Loading details…</div>}
              {!detailsLoading && details && ("Title" in (details as any) ? (
                <>
                  {/* Movie */}
                  <h2 style={{ margin: 0 }}>{(details as MovieDetails).Title}</h2>
                  <div className="meta">
                    {(details as MovieDetails).Year} • {(details as MovieDetails).Genre} • {(details as MovieDetails).Runtime}
                  </div>
                  <p style={{ whiteSpace: "pre-wrap" }}>{(details as MovieDetails).Plot}</p>
                  <div className="row">
                    <span className="badge">Dir: {(details as MovieDetails).Director || "N/A"}</span>
                    <span className="badge">⭐ {(details as MovieDetails).imdbRating || "N/A"}</span>
                  </div>
                </>
              ) : (
                <>
                  {/* Book */}
                  <h2 style={{ margin: 0 }}>{(details as BookDetails).title}</h2>
                  <div className="meta">
                    {(details as BookDetails).authors || "Unknown"} • {(details as BookDetails).publishedDate || "N/A"}
                  </div>
                  <p style={{ whiteSpace: "pre-wrap" }}>{(details as BookDetails).description || "No description."}</p>
                  <div className="row">
                    {(details as BookDetails).categories?.slice(0,3).map(c => <span key={c} className="badge">{c}</span>)}
                    {(details as BookDetails).pageCount && <span className="badge">{(details as BookDetails).pageCount} pages</span>}
                  </div>
                  {(details as BookDetails).previewLink && (
                    <div className="footer">
                      <a className="btn primary" href={(details as BookDetails).previewLink!} target="_blank" rel="noreferrer">Preview</a>
                    </div>
                  )}
                </>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
