import React, { useEffect, useRef, useState } from "react";
import { addDays, startOfWeek, format, addWeeks, subWeeks, parseISO } from "date-fns";
import ruLocale from "date-fns/locale/ru";

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

function AutoFitText({ text, className, min = 10, max = 14 }) {
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
        if (el.scrollWidth <= el.clientWidth - 6) break;
        current -= 1;
      }
      setSize(current);
    };
    requestAnimationFrame(tryFit);
  }, [text, max, min]);
  return (
    <span ref={ref} className={className} style={{ fontSize: size + "px", lineHeight: "1.2", display: "inline-block", width: "100%", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {text}
    </span>
  );
}

export default function TrainerCalendar() {
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [bookings, setBookings] = useLocalStorageState("trainer_bookings_v2", []);
  const [packages, setPackages] = useLocalStorageState("trainer_packages_v2", {});

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [modalHour, setModalHour] = useState(9);
  const [modalClient, setModalClient] = useState("");
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [packageClient, setPackageClient] = useState("");
  const [packageSize, setPackageSize] = useState(10);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [expandedClients, setExpandedClients] = useState({});
  const [expandedPackages, setExpandedPackages] = useState({});
  const [confirmState, setConfirmState] = useState({ open: false, title: "", onConfirm: null });

  function startOfWeekFor(date) {
    return startOfWeek(date, { weekStartsOn: 1 });
  }
  function weekDays(baseDate) {
    const start = startOfWeekFor(baseDate);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }
  const HOURS = Array.from({ length: 15 }).map((_, i) => 7 + i);

  function formatHourForTH(hour) {
    return `${String(hour).padStart(2, "0")}:00`;
  }
  function formatHourForRU(thHour) {
    const ru = (thHour + 24 - 4) % 24;
    return `${String(ru).padStart(2, "0")}:00`;
  }

  function clientNames() {
    return Object.keys(packages);
  }

  function activeClients() {
    return clientNames().filter((n) => (packages[n] || []).some((p) => p.used < p.size));
  }

  function bookingsForDayHour(date, hour) {
    const dateISO = date.toISOString().slice(0, 10);
    return bookings.filter((b) => b.dateISO === dateISO && b.hour === hour);
  }

  function firstAvailablePackageForClient(name) {
    const list = packages[name] || [];
    return list.find((p) => p.used < p.size) || null;
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
      copy[name] = (copy[name] || []).map((p) => (p.id === targetPkg.id ? { ...p, used: (p.used || 0) + 1 } : p));
      return copy;
    });
    setModalOpen(false);
  }

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
            copy[b.clientName] = copy[b.clientName].map((p) => (p.id === b.packageId ? { ...p, used: Math.max(0, (p.used||0) - 1) } : p));
          }
          return copy;
        });
        setBookings((prev) => prev.filter((x) => x.id !== id));
        setSelectedBooking(null);
        setConfirmState({ open: false, title: "", onConfirm: null });
      },
    });
  }

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
      },
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
      },
    });
  }

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
    return bookings.filter((b) => b.packageId === packageId && b.clientName === clientName).sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.hour - b.hour);
  }

  function AddIconButton({ onClick }) {
    return (
      <button onClick={(e) => { e.stopPropagation(); onClick && onClick(); }} className="w-full h-6 flex items-center justify-center text-green-600 text-xl leading-none">
        +
      </button>
    );
  }

  const weekDaysCache = weekDays(anchorDate);

  return (
    <div className="p-4 font-sans max-w-[1200px] mx-auto overflow-x-auto" onClick={() => setSelectedBooking(null)}>
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Тренировочный календарь</h1>
        <div className="flex gap-2">
          <button onClick={() => setAnchorDate(subWeeks(anchorDate, 1))} className="px-3 py-1 bg-gray-100 rounded">← Неделя</button>
          <button onClick={() => setAnchorDate(new Date())} className="px-3 py-1 bg-gray-100 rounded">Сегодня</button>
          <button onClick={() => setAnchorDate(addWeeks(anchorDate, 1))} className="px-3 py-1 bg-gray-100 rounded">Неделя →</button>
        </div>
      </header>

      <table className="border-collapse w-full text-xs">
        <thead>
          <tr>
            <th className="border px-1 py-0.5 bg-yellow-300 text-center">Тай<br/><span className="text-[10px]">(UTC+7)</span></th>
            <th className="border px-1 py-0.5 bg-gray-300 text-center">Рус<br/><span className="text-[10px]">(UTC+3)</span></th>
            {weekDaysCache.map((day, idx) => (
              <th key={idx} className={`border px-1 py-0.5 ${idx >= 5 ? "bg-orange-100" : "bg-red-100"}`}>
                <div className="font-bold text-center">{format(day, "d LLL", { locale: ruLocale })}</div>
                <div className="text-center">{format(day, "EEE", { locale: ruLocale })}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h}>
              <td className="border px-1 py-0.5 text-center align-top bg-yellow-100">{formatHourForTH(h)}</td>
              <td className="border px-1 py-0.5 text-center align-top bg-gray-100">{formatHourForRU(h)}</td>
              {weekDaysCache.map((day, idx) => {
                const items = bookingsForDayHour(day, h);
                return (
                  <td key={idx} className={`border align-top px-1 py-0.5 ${idx >= 5 ? "bg-orange-50" : ""}`}>
                    <div className="flex flex-col gap-1 h-8">
                      {items.map((b) => (
                        <div
                          key={b.id}
                          className="relative bg-blue-100 rounded px-1 flex items-center justify-center cursor-pointer h-6 overflow-hidden"
                          onClick={(e) => { e.stopPropagation(); setSelectedBooking(selectedBooking === b.id ? null : b.id); }}
                        >
                          <div className="w-full">
                            <AutoFitText text={`${b.clientName} - ${b.sessionNumber}`} className="block" min={9} max={12} />
                          </div>
                          {selectedBooking === b.id && (
                            <button title="Удалить" onClick={(e) => { e.stopPropagation(); requestDeleteBooking(b.id); }} className="absolute top-0 right-0 p-1 text-red-500 text-xs">
                              ✕
                            </button>
                          )}
                        </div>
                      ))}

                      {items.length === 0 && (
                        <div className="h-6 flex items-center justify-center">
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

      {/* Панель клиентов */}
      <div className="mt-6 p-4 border rounded bg-gray-50">
        <div className="flex justify-between items-start">
          <h2 className="font-semibold">Прогресс клиентов</h2>
          <button onClick={() => openPackageModalFor("")} className="text-green-600 text-xs">+ пакет</button>
        </div>

        <div className="mt-3 space-y-3">
          {clientNames().length === 0 && <div className="text-sm text-gray-500">Нет данных</div>}
          {clientNames().map((name) => {
            const pkgList = packages[name] || [];
            const totalUsed = pkgList.reduce((s, p) => s + (p.used || 0), 0);
            const totalSize = pkgList.reduce((s, p) => s + (p.size || 0), 0);
            return (
              <div key={name} className="border rounded p-2 bg-white">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleClientExpand(name)}>
                    <div className="font-semibold">{name}</div>
                    <div className="text-xs text-gray-600">{`${totalUsed}/${totalSize}`}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openPackageModalFor(name)} className="text-green-600 text-xs">+ пакет</button>
                    <button onClick={() => requestRemoveClient(name)} className="text-red-500 text-xs">✕</button>
                  </div>
                </div>

                {expandedClients[name] && (
                  <div className="mt-2 ml-4">
                    {pkgList.map((p) => (
                      <div key={p.id} className="mb-1">
                        <div className="flex justify-between items-center cursor-pointer" onClick={() => togglePackageExpand(p.id)}>
                          <div className="text-xs text-gray-700">{`${(p.used||0)}/${p.size} — ${formatPurchase(p.addedISO)}`}</div>
                          {(p.used||0) >= p.size && (
                            <button onClick={(e) => { e.stopPropagation(); requestRemovePackage(name, p.id); }} className="text-red-500 text-xs">✕</button>
                          )}
                        </div>
                        {expandedPackages[p.id] && (
                          <ul className="text-[11px] text-gray-600 ml-4 mt-1 list-disc">
                            {bookingsForPackage(p.id, name).length === 0 && <li>Нет записей</li>}
                            {bookingsForPackage(p.id, name).map((b) => (
                              <li key={b.id}>{b.sessionNumber} / {p.size} — {format(parseISO(b.dateISO), "d LLL", { locale: ruLocale })}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModalOpen(false)}>
          <div className="bg-white p-4 rounded w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Добавить запись</h3>
            <p className="text-sm mb-2">{modalDate && format(modalDate, "d LLL (EEE)", { locale: ruLocale })} — {formatHourForTH(modalHour)} (TH) / {formatHourForRU(modalHour)} (RU)</p>
            <select value={modalClient} onChange={(e) => setModalClient(e.target.value)} className="border w-full px-2 py-1 rounded mb-3">
              <option value="">Выберите клиента</option>
              {[...clientNames()].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={addBooking} className="flex-1 bg-blue-600 text-white py-1 rounded">Сохранить</button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-200 py-1 rounded">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {packageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPackageModalOpen(false)}>
          <div className="bg-white p-4 rounded w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Добавить пакет</h3>
            <input type="text" value={packageClient} onChange={(e) => setPackageClient(e.target.value)} placeholder="Имя клиента" className="border w-full px-2 py-1 rounded mb-3" />
            <select value={packageSize} onChange={(e) => setPackageSize(Number(e.target.value))} className="border w-full px-2 py-1 rounded mb-3">
              <option value={10}>Пакет 10</option>
              <option value={20}>Пакет 20</option>
            </select>
            <div className="flex gap-2">
              <button onClick={savePackage} className="flex-1 bg-blue-600 text-white py-1 rounded">Сохранить</button>
              <button onClick={() => setPackageModalOpen(false)} className="flex-1 bg-gray-200 py-1 rounded">Отмена</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={confirmState.open} title={confirmState.title} onCancel={() => setConfirmState({ open: false, title: "", onConfirm: null })} onConfirm={() => { confirmState.onConfirm && confirmState.onConfirm(); }} />
    </div>
  );
}
