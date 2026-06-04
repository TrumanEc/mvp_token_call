"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "date-fns/locale";
import "react-day-picker/style.css";

/**
 * DateTimePicker — popover con calendario (react-day-picker) + inputs de hora
 * y minutos. El valor de entrada/salida es `"YYYY-MM-DDTHH:mm"`, idéntico al
 * formato del input nativo `datetime-local`, de modo que se conecta sin
 * cambios al resto del form.
 *
 * Independiente del huso horario del navegador: trabaja con strings y los
 * helpers de zona Argentina (UTC-3) del padre se encargan de convertir al
 * mandar/recibir del backend.
 */
interface DateTimePickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

function parseValue(value: string): { date: Date | undefined; hour: string; minute: string } {
    if (!value) return { date: undefined, hour: "00", minute: "00" };
    const [datePart, timePart = "00:00"] = value.split("T");
    const [yyyy, mm, dd] = datePart.split("-").map((n) => parseInt(n, 10));
    const [hh, min] = timePart.split(":");
    const date = !isNaN(yyyy) ? new Date(yyyy, mm - 1, dd) : undefined;
    return { date, hour: (hh || "00").padStart(2, "0"), minute: (min || "00").padStart(2, "0") };
}

function buildValue(date: Date | undefined, hour: string, minute: string): string {
    if (!date) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = (hour || "00").padStart(2, "0");
    const min = (minute || "00").padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function formatDisplay(value: string): string {
    if (!value) return "";
    const { date, hour, minute } = parseValue(value);
    if (!date) return "";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}  ${hour}:${minute}`;
}

export function DateTimePicker({
    value,
    onChange,
    placeholder = "Seleccionar fecha y hora",
    className = "",
}: DateTimePickerProps) {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const parsed = parseValue(value);

    // Cerrar al hacer click afuera
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleDateSelect = (date: Date | undefined) => {
        onChange(buildValue(date, parsed.hour, parsed.minute));
    };

    const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Math.max(0, Math.min(23, parseInt(e.target.value || "0", 10) || 0));
        onChange(buildValue(parsed.date, String(v).padStart(2, "0"), parsed.minute));
    };

    const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Math.max(0, Math.min(59, parseInt(e.target.value || "0", 10) || 0));
        onChange(buildValue(parsed.date, parsed.hour, String(v).padStart(2, "0")));
    };

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full h-14 bg-win-bg border border-white/5 rounded-2xl px-4 text-left text-white font-bold outline-none focus:border-primary transition-all flex items-center justify-between"
            >
                <span className={value ? "" : "text-gray-500"}>
                    {value ? formatDisplay(value) : placeholder}
                </span>
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </button>

            {open && (
                <div className="absolute z-50 mt-2 left-0 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl p-4 min-w-[320px]">
                    <DayPicker
                        mode="single"
                        selected={parsed.date}
                        onSelect={handleDateSelect}
                        locale={es}
                        weekStartsOn={1}
                        showOutsideDays
                        className="dtp-calendar"
                        styles={{
                            day: { color: "white" },
                        }}
                        modifiersStyles={{
                            selected: { backgroundColor: "#64c883", color: "black", fontWeight: 700 },
                            today: { color: "#64c883", fontWeight: 700 },
                        }}
                    />
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Hora
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="23"
                            value={parsed.hour}
                            onChange={handleHourChange}
                            className="w-14 bg-win-bg border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-sm font-mono outline-none focus:border-primary"
                        />
                        <span className="text-white font-bold">:</span>
                        <input
                            type="number"
                            min="0"
                            max="59"
                            value={parsed.minute}
                            onChange={handleMinuteChange}
                            className="w-14 bg-win-bg border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-sm font-mono outline-none focus:border-primary"
                        />
                        <span className="text-[9px] text-gray-500 ml-auto">Argentina UTC-3</span>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <button
                            type="button"
                            onClick={() => onChange("")}
                            className="px-3 py-1.5 text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-wider"
                        >
                            Limpiar
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="px-3 py-1.5 bg-primary text-black rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
                        >
                            Listo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
