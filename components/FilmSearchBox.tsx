// components/FilmSearchBox.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MovieResult = {
  id: number;
  title: string;
  year?: number | null;
  status: "NOW_SHOWING" | "UPCOMING" | "NONE";
};

export default function FilmSearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);

      try {
        const res = await fetch(
          `/api/movies/search?q=${encodeURIComponent(trimmed)}`
        );

        if (!res.ok) {
          const text = await res.text();
          console.error("Search API returned non OK response:", text);
          setResults([]);
          setOpen(true);
          return;
        }

        const data = await res.json();

        if (Array.isArray(data)) {
          setResults(data);
        } else {
          console.error("Search API did not return an array:", data);
          setResults([]);
        }

        setOpen(true);
      } catch (error) {
        console.error("Search request failed:", error);
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(movieId: number) {
    setOpen(false);
    setQuery("");
    router.push(`/films/${movieId}`);
  }

  function getStatusLabel(status: MovieResult["status"]) {
    if (status === "NOW_SHOWING") return "Now showing";
    if (status === "UPCOMING") return "Upcoming";
    return "No current showtimes";
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        width: "320px",
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.trim().length >= 2) {
            setOpen(true);
          }
        }}
        placeholder="Search all films, including not now showing"
        style={{
          width: "100%",
          backgroundColor: "#0a0a0a",
          color: "#fff",
          border: "1px solid #464646",
          padding: "10px 14px",
          borderRadius: "4px",
          fontSize: "0.95rem",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: "100%",
            backgroundColor: "#0a0a0a",
            border: "1px solid #333",
            borderRadius: "6px",
            overflow: "hidden",
            zIndex: 1000,
            maxHeight: "360px",
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
          }}
        >
          {loading && (
            <div
              style={{
                padding: "12px 14px",
                color: "#aaa",
                fontSize: "0.9rem",
              }}
            >
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div
              style={{
                padding: "12px 14px",
                color: "#777",
                fontSize: "0.9rem",
              }}
            >
              No films found
            </div>
          )}

          {!loading &&
            results.map((movie, index) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => handleSelect(movie.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    index === results.length - 1 ? "none" : "1px solid #1f1f1f",
                  padding: "12px 14px",
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                <div
                  style={{
                    fontSize: "0.95rem",
                    marginBottom: "4px",
                    lineHeight: 1.3,
                  }}
                >
                  {movie.title}
                  {movie.year ? ` (${movie.year})` : ""}
                </div>

                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#888",
                    lineHeight: 1.2,
                  }}
                >
                  {getStatusLabel(movie.status)}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}