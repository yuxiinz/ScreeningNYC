// components/DateSelector.tsx

"use client"; 

import { useRouter } from "next/navigation";

export default function DateSelector({ currentSafeDate }: { currentSafeDate: string }) {
  const router = useRouter();

  return (
    <div style={{ marginBottom: '40px' }}>
      <input 
        type="date" 
        defaultValue={currentSafeDate}
        onChange={(e) => {
          router.push(`/date?date=${e.target.value}`);
        }}
        style={{ 
          backgroundColor: '#1a1a1a', 
          color: '#fff', 
          border: '1px solid #333', 
          padding: '10px 15px', 
          borderRadius: '4px',
          fontSize: '1rem',
          outline: 'none',
          cursor: 'pointer'
        }}
      />
    </div>
  );
}