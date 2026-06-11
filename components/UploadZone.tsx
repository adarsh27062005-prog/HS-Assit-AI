"use client";

import { useCallback, useState, useRef } from "react";
import { motion } from "framer-motion";

interface Props {
  onFile: (file: File) => void;
}

export default function UploadZone({ onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-14 transition-all duration-300
        ${
          dragging
            ? "border-indigo-400/80 bg-indigo-500/10"
            : "border-white/15 bg-white/[0.03] hover:border-indigo-400/50 hover:bg-white/[0.05]"
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(600px circle at 50% 0%, rgba(99,102,241,0.12), transparent 60%)",
        }}
      />

      <div className="relative flex flex-col items-center justify-center gap-4 text-center">
        <motion.div
          animate={{ y: dragging ? -6 : 0 }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/30 to-cyan-400/20 ring-1 ring-white/10"
        >
          <svg className="h-7 w-7 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </motion.div>
        <div>
          <p className="text-base font-medium text-white">
            Drop your <span className="text-gradient font-semibold">Master_Tables.xlsx</span> here
          </p>
          <p className="mt-1 text-sm text-white/50">or click to browse — .xlsx / .xls only</p>
        </div>
      </div>
    </motion.div>
  );
}
