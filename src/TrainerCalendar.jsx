// ==================== Импорты ====================
import React, { useEffect, useRef, useState } from "react";
import { addDays, startOfWeek, format, addWeeks, subWeeks, parseISO } from "date-fns";
import ruLocale from "date-fns/locale/ru";

// ==================== Хук для LocalStorage ====================
// Сохраняем и читаем данные (записи и пакеты) из localStorage
function useLocalStorageState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// ==================== Модал подтверждения удаления ====================
function ConfirmModal({ open, title, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white p-4 rounded w-80 shadow">
        <div className="font-semibold mb-2">{title}</div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1 rounded bg-gray-200">Отмена</button>
          <button onClick={onConfirm} className="px-3 py-1 rounded bg-red-500 text-white">Удалить</button>
        </div>
      </div>
    </div>
  );
}

// ==================== Автоматическое уменьшение текста ====================
function AutoFitText({ text, className, min = 9, max = 12 }) { // 🔹 сделал чуть меньше min/max
  const ref = useRef(null);
  const [size, setSize] = useState(max);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize(max);
    const tryFit = () => {
      let current = max;
      while (current > min) {
        el.style.fontSize = current + "px";
        if (el.scrollWidth <= el.clientWidth - 4) break; // 🔹 уменьшил отступ для точности
        current -= 1;
      }
      setSize(current);
    };
    requestAnimationFrame(tryFit);
  }, [text, max, min]);
  return (
    <span
      ref={ref}
      className={className}
      style={{
        fontSize: size + "px",
        lineHeight: "1.2",
        display: "inline-block",
        width: "100%",
        textAlign: "center",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }}
    >
      {text}
    </span>
  );
}

// ==================== Основной компонент ====================
export default function TrainerCalendar() {
  // -------------------- Состояния --------------------
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [bookings, setBookings] = useLocalStorageState("trainer_bookings_v2", []); // записи
  const [packages, setPackages] = useLocalStorageState("trainer_packages_v2", {}); // пакеты

  const [modalOpen, setModalOpen] = useState(false); // модал добавления записи
  const [modalDate, setModalDate] = useState(null);
  const [modalHour, setModalHour] = useState(9);
  const [modalClient, setModalClient] = useState("");

  const [packageModalOpen, setPackageModalOpen] = useState(false); // модал пакета
  const [packageClient, setPackageClient] = useState("");
  const [packageSize, setPackageSize] = useState(10);

  const [selectedBooking, setSelectedBooking] = useState(null); // выделенная запись
  const [expandedClients, setExpandedClients] = useState({}); // раскрытые клиенты
  const [expandedPackages, setExpandedPackages] = useState({}); // раскрытые пакеты
  const [confirmState, setConfirmState] = useState({ open: false, title: "", onConfirm: null });

  // -------------------- Даты и время --------------------
  function startOfWeekFor(date) {
    return startOfWeek(date, { weekStartsOn: 1 });
  }
  function weekDays(baseDate) {
    const start = startOfWeekFor(baseDate);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }
  const HOURS = Array.from({ length: 15 }).map((_, i) => 7 + i); // часы с 7:00 до 21:00

  function formatHourForTH(hour) {
    return `${String(hour).padStart(2, "0")}:00`;
  }
  function formatHourForRU(thHour) {
    const ru = (thHour + 24 - 4) % 24;
    return `${String(ru).padStart(2, "0")}:00`;
  }

  // -------------------- Работа с клиентами и пакетами --------------------
  function clientNames() {
    return Object.keys(packages);
  }
  function activeClients() {
    return clientNames().filter((n) => (packages[n] || []).some((p) => p.used < p.size));
  }

  // -------------------- Работа с бронированием --------------------
  function bookingsForDayHour(date, hour) {
    const dateISO = date.toISOString().slice(0, 10);
    return bookings.filter((b) => b.dateISO === dateISO && b.hour === hour);
  }

  function openBookingModal(date, hour) {
    setModalDate(date);
    setModalHour(hour);
    const act = activeClients();
    const name = act.length ? act[0] : (clientNames()[0] || "");
    setModalClient(name);
    setModalOpen(true);
  }

  function addBooking() {
    const name = modalClient?.trim();
    if (!name) {
      alert("Выберите клиента.");
      return;
    }
    const pkgList = packages[name] || [];
    const targetPkg = pkgList.find((p) => p.used < p.size);
    if (!targetPkg) {
      alert("У клиента нет доступных пакетов. Добавьте пакет.");
      return;
    }
    const dateISO = modalDate.toISOString().slice(0, 10);
    const exists = bookings.some((b) => b.dateISO === dateISO && b.hour === modalHour);
    if (exists) {
      alert("На это время уже есть запись.");
      return;
    }
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const sessionNumber = targetPkg.used + 1;
    const b = { id, dateISO, hour: modalHour, clientName: name, packageId: targetPkg.id, sessionNumber };
    setBookings((prev) => [...prev, b]);
    setPackages((prev) => {
      const copy = { ...prev };
      copy[name] = (copy[name] || []).map((p) =>
        p.id === targetPkg.id ? { ...p, used: (p.used || 0) + 1 } : p
      );
      return copy;
    });
    setModalOpen(false);
  }

  // -------------------- Удаление бронирования --------------------
  function requestDeleteBooking(id) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    setConfirmState({
      open: true,
      title: "Удалить запись?",
      onConfirm: () => {
        setPackages((prev) => {
          const copy = { ...prev };
          if (copy[b.clientName]) {
            copy[b.clientName] = copy[b.clientName].map((p) =>
              p.id === b.packageId ? { ...p, used: Math.max(0, (p.used || 0) - 1) } : p
            );
          }
          return copy;
        });
        setBookings((prev) => prev.filter((x) => x.id !== id));
        setSelectedBooking(null);
        setConfirmState({ open: false, title: "", onConfirm: null });
      }
    });
  }

  // -------------------- Управление пакетами --------------------
  function openPackageModalFor(name = "") {
    setPackageClient(name);
    setPackageSize(10);
    setPackageModalOpen(true);
  }

  function savePackage() {
    const name = (packageClient || "").trim();
    if (!name) {
      alert("Введите имя клиента.");
      return;
    }
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const newPkg = { id, size: Number(packageSize || 10), used: 0, addedISO: new Date().toISOString().slice(0, 10) };
    setPackages((prev) => {
      const copy = { ...prev };
      copy[name] = [...(copy[name] || []), newPkg];
      return copy;
    });
    setPackageModalOpen(false);
  }

  // -------------------- Удаление клиента и пакета --------------------
  function requestRemoveClient(name) {
    const pkgList = packages[name] || [];
    const hasActive = pkgList.some((p) => p.used < p.size);
    if (hasActive) {
      alert("Нельзя удалить клиента, пока есть незавершённые пакеты.");
      return;
    }
    setConfirmState({
      open: true,
      title: `Удалить клиента ${name} из списка? (записи в календаре останутся)`,
      onConfirm: () => {
        setPackages((prev) => {
          const copy = { ...prev };
          delete copy[name];
          return copy;
        });
        setConfirmState({ open: false, title: "", onConfirm: null });
      }
    });
  }

  function requestRemovePackage(clientName, packageId) {
    const list = packages[clientName] || [];
    const pkg = list.find((p) => p.id === packageId);
    if (!pkg) return;
    if ((pkg.used || 0) < pkg.size) {
      alert("Нельзя удалить незавершённый пакет.");
      return;
    }
    setConfirmState({
      open: true,
      title: `Удалить пакет ${pkg.used}/${pkg.size} у ${clientName}? (записи останутся)`,
      onConfirm: () => {
        setPackages((prev) => {
          const copy = { ...prev };
          copy[clientName] = (copy[clientName] || []).filter((p) => p.id !== packageId);
          return copy;
        });
        setConfirmState({ open: false, title: "", onConfirm: null });
      }
    });
  }

  // -------------------- Вспомогательные функции --------------------
  function formatPurchase(dateISO) {
    try {
      return format(parseISO(dateISO), "d LLL", { locale: ruLocale });
    } catch {
      return dateISO;
    }
  }
  function toggleClientExpand(name) {
    setExpandedClients((prev) => ({ ...prev, [name]: !prev[name] }));
  }
  function togglePackageExpand(packageId) {
    setExpandedPackages((prev) => ({ ...prev, [packageId]: !prev[packageId] }));
  }
  function bookingsForPackage(packageId, clientName) {
    return bookings
      .filter((b) => b.packageId === packageId && b.clientName === clientName)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.hour - b.hour);
  }

  // -------------------- Кнопка добавления "+" --------------------
  function AddIconButton({ onClick }) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick && onClick();
        }}
        className="w-full h-5 flex items-center justify-center text-green-600 text-lg leading-none" // 🔹 уменьшил размер кнопки
      >
        +
      </button>
    );
  }

  const weekDaysCache = weekDays(anchorDate);

  // ==================== UI ====================
  return (
    <div className="p-2 font-sans max-w-full mx-auto overflow-x-auto" onClick={() => setSelectedBooking(null)}>
      {/* ---------- Заголовок и кнопки ---------- */}
      <header className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-bold">Тренировочный календарь</h1>
        <div className="flex gap-1">
          <button onClick={() => setAnchorDate(subWeeks(anchorDate, 1))} className="px-2 py-0.5 bg-gray-100 rounded text-xs">← Неделя</button>
          <button onClick={() => setAnchorDate(new Date())} className="px-2 py-0.5 bg-gray-100 rounded text-xs">Сегодня</button>
          <button onClick={() => setAnchorDate(addWeeks(anchorDate, 1))} className="px-2 py-0.5 bg-gray-100 rounded text-xs">Неделя →</button>
        </div>
      </header>

      {/* ---------- Таблица ---------- */}
      <div className="overflow-x-auto">
        <table className="border-collapse w-full text-[11px] table-fixed min-w-[650px]"> {/* 🔹 уменьшил min-width */}
          <thead>
            <tr>
              <th className="border px-1 py-0.5 bg-yellow-300 text-center sticky left-0 z-30 w-14"> {/* 🔹 уменьшил ширину */}
                Тай<br/><span className="text-[9px]">(UTC+7)</span>
              </th>
              <th className="border px-1 py-0.5 bg-gray-300 text-center sticky left-14 z-20 w-14"> {/* 🔹 уменьшил ширину */}
                Рус<br/><span className="text-[9px]">(UTC+3)</span>
              </th>
              {weekDaysCache.map((day, idx) => (
                <th key={idx} className={`border px-1 py-0.5 ${idx >= 5 ? "bg-orange-100" : "bg-red-100"}`}>
                  <div className="font-bold text-center text-[11px]">{format(day, "d LLL", { locale: ruLocale })}</div>
                  <div className="text-center text-[10px]">{format(day, "EEE", { locale: ruLocale })}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                {/* Время Тай */}
                <td className="border px-1 py-0.5 text-center align-top bg-yellow-100 sticky left-0 z-20 w-9 text-[11px]">
                  {formatHourForTH(h)}
                </td>
                {/* Время Рус */}
                <td className="border px-1 py-0.5 text-center align-top bg-gray-100 sticky left-14 z-10 w-14 text-[11px]">
                  {formatHourForRU(h)}
                </td>
                {/* Ячейки с записями */}
                {weekDaysCache.map((day, idx) => {
                  const items = bookingsForDayHour(day, h);
                  const isBooked = items.length > 0;
                  return (
                    <td
                      key={idx}
                      onClick={() => {
                        if (!isBooked) openBookingModal(day, h);
                      }}
                      className={`border align-top px-0.5 py-0.5 cursor-pointer ${
                        idx >= 5 ? "bg-orange-50" : ""
                      } ${isBooked ? "bg-blue-200" : ""}`}
                    >
                      <div className="flex flex-col gap-0.5 h-6"> {/* 🔹 уменьшил высоту */}
                        {items.map((b) => (
                          <div
                            key={b.id}
                            className="relative rounded px-0.5 flex items-center justify-center cursor-pointer h-5 overflow-hidden bg-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBooking(selectedBooking === b.id ? null : b.id);
                            }}
                          >
                            <div className="w-full">
                              <AutoFitText text={`${b.clientName} - ${b.sessionNumber}`} className="block" min={8} max={11} />
                            </div>
                            {selectedBooking === b.id && (
                              <button
                                title="Удалить"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestDeleteBooking(b.id);
                                }}
                                className="absolute top-0 right-0 p-0.5 text-red-500 text-[10px] opacity-40 hover:opacity-100"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}

                        {!isBooked && (
                          <div className="h-5 flex items-center justify-center">
                            <AddIconButton onClick={() => openBookingModal(day, h)} />
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Панель клиентов ---------- */}
      <div className="mt-4 p-2 border rounded bg-gray-50">
        <div className="flex justify-between items-start">
          <h2 className="font-semibold text-sm">Прогресс клиентов</h2>
          <button onClick={() => openPackageModalFor("")} className="text-green-600 text-xs">+ пакет</button>
        </div>

        <div className="mt-2 space-y-2">
          {clientNames().length === 0 && <div className="text-xs text-gray-500">Нет данных</div>}
          {clientNames().map((name) => {
            const pkgList = packages[name] || [];
            const totalUsed = pkgList.reduce((s, p) => s + (p.used || 0), 0);
            const totalSize = pkgList.reduce((s, p) => s + (p.size || 0), 0);
            return (