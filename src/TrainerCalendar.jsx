// src/TrainerCalendar.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDays, startOfWeek, format, addWeeks, subWeeks, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDocs
} from "firebase/firestore";
import { db } from "./firebase";

/* -------------------- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ -------------------- */

// ✅ Модал подтверждения удаления
function ConfirmModal({ open, title, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white p-3 rounded w-72 shadow text-sm">
        <div className="font-semibold mb-2">{title}</div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-2 py-1 rounded bg-gray-200">Отмена</button>
          <button onClick={onConfirm} className="px-2 py-1 rounded bg-red-500 text-white">Удалить</button>
        </div>
      </div>
    </div>
  );
}

// ✅ Автоматически уменьшающий текст
function AutoFitText({ text, className, min = 7, max = 11 }) {
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
        if (el.scrollWidth <= el.clientWidth - 4) break;
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
        lineHeight: "1.1",
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

/* --------------------------- ОСНОВНОЙ КОМПОНЕНТ --------------------------- */

export default function TrainerCalendar() {
  const [bookings, setBookings] = useState([]);
  const [packages, setPackages] = useState([]);

  const [anchorDate, setAnchorDate] = useState(new Date());

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

  // --- состояние свайпа (для ПРАВОГО блока с днями) ---
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [animating, setAnimating] = useState(false);
  const touchStartX = useRef(0);

  // 🔥 Firebase listeners
  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubPackages = onSnapshot(collection(db, "packages"), (snap) => {
      setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubBookings();
      unsubPackages();
    };
  }, []);

  /* --------------------------- ВСПОМОГАТЕЛЬНЫЕ --------------------------- */
  function startOfWeekFor(date) {
    return startOfWeek(date, { weekStartsOn: 1 });
  }
  function weekDays(baseDate) {
    const start = startOfWeekFor(baseDate);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }
  const HOURS = Array.from({ length: 15 }).map((_, i) => 9 + i); // 09..23 тай, а рус ниже сдвигается

  function formatHourForTH(hour) {
    return `${String(hour).padStart(2, "0")}:00`;
  }
  function formatHourForRU(thHour) {
    const ruHour = (thHour + 24 - 4) % 24; // ваш текущий сдвиг
    return `${String(ruHour).padStart(2, "0")}:00`;
  }

  // имена клиентов (учитываем одиночные и общие пакеты)
  function clientNames() {
    const all = [];
    for (const p of packages) {
      if (p.clientName) all.push(p.clientName);
      if (Array.isArray(p.clientNames)) all.push(...p.clientNames);
    }
    return [...new Set(all)];
  }

  function activeClients() {
    return clientNames().filter((n) =>
      packages.some(
        (p) =>
          (p.clientName === n || (Array.isArray(p.clientNames) && p.clientNames.includes(n))) &&
          p.used < p.size
      )
    );
  }

  function bookingsForDayHour(date, hour) {
    const dateISO = format(date, "yyyy-MM-dd");
    return bookings.filter((b) => b.dateISO === dateISO && b.hour === hour);
  }

  /* --------------------------- СВАЙП ЛОГИКА --------------------------- */
  // три недели: прошлая, текущая, следующая
  // eslint-disable-next-line react-hooks/exhaustive-deps
const visibleWeeks = useMemo(() => ([
  weekDays(subWeeks(anchorDate, 1)),
  weekDays(anchorDate),
  weekDays(addWeeks(anchorDate, 1)),
]), [anchorDate]);

  function handleTouchStart(e) {
    if (animating) return;
    touchStartX.current = e.touches[0].clientX;
    setIsDragging(true);
  }
  function handleTouchMove(e) {
    if (!isDragging || animating) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    setDragX(delta);
  }
  function handleTouchEnd() {
    if (!isDragging || animating) return;
    setIsDragging(false);

    const threshold = 60; // пиксели
    const direction = dragX < -threshold ? "left" : dragX > threshold ? "right" : null;

    if (direction) {
      setAnimating(true);
      setDragX(direction === "left" ? -window.innerWidth : window.innerWidth);
      setTimeout(() => {
        if (direction === "left") setAnchorDate((d) => addWeeks(d, 1));
        else setAnchorDate((d) => subWeeks(d, 1));
        setDragX(0);
        setAnimating(false);
      }, 250);
    } else {
      // вернуть на место
      setDragX(0);
    }
  }

  /* --------------------------- CRUD: БРОНЬ --------------------------- */
  async function addBooking() {
    const name = modalClient?.trim();
    if (!name) return alert("Выберите клиента.");

    // 1. Пакеты с участием клиента
    let pkgList = packages.filter(
      (p) =>
        p.clientName === name ||
        (Array.isArray(p.clientNames) && p.clientNames.includes(name))
    );
    if (pkgList.length === 0) {
      return alert("У клиента нет доступных пакетов.");
    }

    // 2. Если есть общий пакет — брать все пакеты с тем же составом
    const sharedPkg = pkgList.find(
      (p) => Array.isArray(p.clientNames) && p.clientNames.length > 1
    );
    if (sharedPkg) {
      const sharedNames = [...sharedPkg.clientNames].sort();
      pkgList = packages.filter((p) => {
        if (!Array.isArray(p.clientNames)) return false;
        const current = [...p.clientNames].sort();
        return JSON.stringify(current) === JSON.stringify(sharedNames);
      });
    }

    // 3. Сортировка по дате добавления (старые -> новые)
    pkgList = pkgList.sort((a, b) => {
      const da = new Date(a.addedISO || 0);
      const db = new Date(b.addedISO || 0);
      return da - db;
    });

    // 4. Первый незавершенный пакет
    const targetPkg = pkgList.find((p) => p.used < p.size);
    if (!targetPkg) return alert("У клиента нет доступных пакетов.");

    const dateISO = format(modalDate, "yyyy-MM-dd");
    const exists = bookings.some(
      (b) => b.dateISO === dateISO && b.hour === modalHour
    );
    if (exists) return alert("На это время уже есть запись.");

    const sessionNumber = (targetPkg.used || 0) + 1;

    await addDoc(collection(db, "bookings"), {
      clientName: name,
      dateISO,
      hour: modalHour,
      packageId: targetPkg.id,
      sessionNumber,
    });

    await updateDoc(doc(db, "packages", targetPkg.id), {
      used: sessionNumber,
    });

    setModalOpen(false);
  }

  /* --------------------------- CRUD: УДАЛЕНИЕ БРОНИ --------------------------- */
  async function requestDeleteBooking(id) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;

    setConfirmState({
      open: true,
      title: "Удалить запись?",
      onConfirm: async () => {
        await deleteDoc(doc(db, "bookings", id));

        const pkgRef = doc(db, "packages", b.packageId);
        const pkg = packages.find((p) => p.id === b.packageId);
        if (pkg) {
          await updateDoc(pkgRef, { used: Math.max(0, (pkg.used || 1) - 1) });
        }

        setSelectedBooking(null);
        setConfirmState({ open: false, title: "", onConfirm: null });
      }
    });
  }

  /* --------------------------- CRUD: ПАКЕТ --------------------------- */
  async function savePackage() {
    const raw = (packageClient || "").trim();
    if (!raw) return alert("Введите имя клиента (или несколько через запятую).");

    const names = raw.split(",").map(n => n.trim()).filter(Boolean);
    if (names.length === 0) return alert("Введите хотя бы одно имя.");

    const data = {
      size: Number(packageSize || 10),
      used: 0,
      addedISO: new Date().toISOString().slice(0, 10)
    };

    if (names.length === 1) {
      data.clientName = names[0];
    } else {
      data.clientNames = names;
    }

    await addDoc(collection(db, "packages"), data);

    setPackageModalOpen(false);
  }

  async function requestRemovePackage(clientName, packageId) {
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg || pkg.used < pkg.size) {
      alert("Нельзя удалить незавершённый пакет.");
      return;
    }
    if (!window.confirm(`Удалить пакет ${pkg.used}/${pkg.size} у ${clientName}?`)) return;
    await deleteDoc(doc(db, "packages", packageId));
  }

  async function requestRemoveClient(clientName) {
    const pkgList = packages.filter((p) => p.clientName === clientName);
    const hasActive = pkgList.some((p) => p.used < p.size);
    if (hasActive) {
      alert("Нельзя удалить клиента, пока есть незавершённые пакеты.");
      return;
    }
    if (!window.confirm(`Удалить клиента ${clientName}?`)) return;

    for (const p of pkgList) {
      await deleteDoc(doc(db, "packages", p.id));
    }
    const qb = query(collection(db, "bookings"), where("clientName", "==", clientName));
    const snapB = await getDocs(qb);
    for (const b of snapB.docs) {
      await deleteDoc(doc(db, "bookings", b.id));
    }
  }

  // вспомогательные
  function formatPurchase(dateISO) {
    try {
      return format(parseISO(dateISO), "d LLL", { locale: ru });
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

  

  /* ----------------------------------- UI ----------------------------------- */

  return (
    <div
      className="p-4 font-sans max-w-5xl mx-auto text-xs mt-6"
      onClick={() => setSelectedBooking(null)}
      style={{ overscrollBehavior: "none" }}
    >
      {/* заголовок */}
      <header className="flex items-center justify-between mb-2">
        <div className="font-semibold ml-auto flex gap-3 text-[13px]">
          <button onClick={() => setAnchorDate(subWeeks(anchorDate, 1))} className="px-2 py-0.5 bg-gray-100 rounded">←</button>
          <button onClick={() => setAnchorDate(new Date())} className="px-2 py-0.5 bg-gray-100 rounded">Сегодня</button>
          <button onClick={() => setAnchorDate(addWeeks(anchorDate, 1))} className="px-2 py-0.5 bg-gray-100 rounded">→</button>
        </div>
      </header>

      {/* КАЛЕНДАРЬ: ДВЕ ЧАСТИ — ЛЕВАЯ (фикс) + ПРАВАЯ (свайп) */}
      <div className="w-full relative">
        <div className="grid grid-cols-[60px_60px_1fr]">
          {/* ЛЕВАЯ ФИКС. ЧАСТЬ: два столбца Тай/Рус */}
          <div className="col-span-2">
            <table className="border-collapse w-[120px] text-[7px] table-fixed">
              <colgroup>
                <col style={{ width: "60px" }} />
                <col style={{ width: "60px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border px-1 py-0.5 bg-yellow-100 text-center w-[60px] sticky left-0 z-30">
                    Тай<br /><span className="text-[7px]"></span>
                  </th>
                  <th className="border px-1 py-0.5 bg-gray-100 text-center w-[60px] sticky left-[60px] z-20">
                    Рус<br /><span className="text-[7px]"></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {HOURS.map((h) => (
                  <tr key={`left-${h}`}>
                    <td className="border text-center bg-yellow-100 w-[60px] text-[6px] h-6 align-middle">
                      {formatHourForTH(h)}
                    </td>
                    <td className="border text-center bg-gray-100 w-[60px] text-[6px] h-6 align-middle">
                      {formatHourForRU(h)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ПРАВАЯ СВАЙП-ОБЛАСТЬ: 7 столбцов дней; «подглядывание» соседних недель */}
          <div
            className="overflow-hidden relative select-none touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={`flex transition-transform ${animating ? "duration-300 ease-in-out" : "duration-75 ease-out"}`}
              style={{
                transform: `translateX(calc(${dragX}px - 100%))`,
                width: "300%",
                willChange: "transform",
              }}
            >
              {visibleWeeks.map((days, panelIdx) => (
                <div key={panelIdx} className="w-full shrink-0">
                  <table className="border-collapse w-full text-[7px] table-fixed">
                    <colgroup>
                      {days.map((_, i) => (
                        <col key={i} style={{ width: `${100 / 7}%` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {days.map((day, idx) => {
                          const monthShort = format(day, "d MMM", { locale: ru })
                            .replace(/\./g, "")
                            .slice(0, 6)
                            .replace(/\s+$/, "");
                          const ruShortByIndex = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
                          const weekday2 = ruShortByIndex[day.getDay()];
                          const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                          return (
                            <th
                              key={idx}
                              className={`border px-1 py-0.5 text-[9px] transition
                                ${isToday
                                  ? "bg-yellow-200 border-yellow-400 shadow-inner"
                                  : idx >= 5
                                    ? "bg-orange-50"
                                    : "bg-red-100"
                                }`}
                            >
                              <div className="italic text-[7px] text-center">{monthShort}</div>
                              <div className="font-bold text-center text-[11px]">
                                {weekday2} {isToday && <span className="text-yellow-700">*</span>}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {HOURS.map((h) => (
                        <tr key={`right-${panelIdx}-${h}`}>
                          {days.map((day, idx) => {
                            const items = bookingsForDayHour(day, h);
                            const isBooked = items.length > 0;
                            return (
                              <td
                                key={idx}
                                onClick={() => {
                                  if (!isBooked) {
                                    setModalDate(day);
                                    setModalHour(h);
                                    setModalClient(activeClients()[0] || "");
                                    setModalOpen(true);
                                  }
                                }}
                                className={`border align-top px-1 py-0.5 cursor-pointer h-6
                                  ${isBooked ? "bg-blue-200" : idx >= 5 ? "bg-orange-50" : "bg-white"}`}
                              >
                                <div className="flex flex-col gap-1 h-full">
                                  {items.map((b) => (
                                    <div
                                      key={b.id}
                                      className="relative rounded px-1 flex items-center justify-center cursor-pointer h-full overflow-hidden"
                                      onClick={(e) => { e.stopPropagation(); setSelectedBooking(selectedBooking === b.id ? null : b.id); }}
                                    >
                                      <div className="flex items-center justify-center w-full h-full text-[7px]">
                                        <AutoFitText text={b.clientName} className="block" min={7} max={7} />
                                        <div className="absolute bottom-0 left-0 text-[6px] leading-none px-[1px] pb-[1px]">
                                          {b.sessionNumber}
                                        </div>
                                      </div>
                                      {selectedBooking === b.id && (
                                        <button
                                          title="Удалить"
                                          onClick={(e) => { e.stopPropagation(); requestDeleteBooking(b.id); }}
                                          className="absolute inset-0 flex items-center justify-center text-red-500 text-[27px]"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* панель клиентов */}
      <div className="mt-4 p-2 border rounded bg-gray-50 text-[12px]">
        <div className="flex justify-between items-start">
          <button onClick={() => setPackageModalOpen(true)} className="font-semibold text-green-600 text-[20px]">+</button>
        </div>
        <div className="mt-2 space-y-2">
          {clientNames().length === 0 && <div className="text-gray-500">Нет данных</div>}
          {clientNames().map((name) => {
            const pkgList = packages.filter(
              (p) =>
                p.clientName === name ||
                (Array.isArray(p.clientNames) && p.clientNames.includes(name))
            );
            const activePkg = pkgList.find((p) => p.used < p.size);
            const sharedPkg = pkgList.find(
              (p) => Array.isArray(p.clientNames) && p.clientNames.length > 1
            );
            const isSecondaryInShared =
              sharedPkg && sharedPkg.clientNames[0] !== name;

            return (
              <div key={name} className="border rounded p-1 bg-white">
                <div className="flex justify-between items-center">
                  <div
                    className="flex items-center gap-1 cursor-pointer"
                    onClick={() => toggleClientExpand(name)}
                  >
                    <div className="font-semibold">{name}</div>
                    <div className="text-gray-600 text-[10px]">
                      {activePkg ? `${activePkg.used}/${activePkg.size}` : "✓ завершено"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isSecondaryInShared && (
                      <button
                        onClick={() => {
                          if (sharedPkg && Array.isArray(sharedPkg.clientNames)) {
                            setPackageClient(sharedPkg.clientNames.join(", "));
                          } else {
                            setPackageClient(name);
                          }
                          setPackageSize(10);
                          setPackageModalOpen(true);
                        }}
                        className="font-semibold text-green-600 text-[11px]"
                      >
                        + пакет
                      </button>
                    )}
                    <button onClick={() => requestRemoveClient(name)} className="text-red-500 text-[10px]">
                      удалить
                    </button>
                  </div>
                </div>

                {expandedClients[name] && (
                  <div className="mt-1 ml-2">
                    {pkgList.map((p) => (
                      <div key={p.id} className="mb-0.5">
                        <div
                          className="flex justify-between items-center cursor-pointer"
                          onClick={() => togglePackageExpand(p.id)}
                        >
                          <div className="text-gray-700 text-[10px]">
                            {`${p.used || 0}/${p.size} — ${formatPurchase(p.addedISO)}`}
                          </div>

                          {p.clientNames && p.clientNames.length > 1 && (
                            <div className="text-gray-500 text-[9px] italic">
                              Общий пакет для: {p.clientNames.join(", ")}
                            </div>
                          )}

                          {(p.used || 0) >= p.size && (
                            <button
                              onClick={(e) => { e.stopPropagation(); requestRemovePackage(name, p.id); }}
                              className="text-red-500 text-[10px]"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {expandedPackages[p.id] && (
                          <ul className="text-[10px] text-gray-600 ml-3 mt-1 list-disc">
                            {bookingsForPackage(p.id, name).length === 0 && <li>Нет записей</li>}
                            {bookingsForPackage(p.id, name).map((b) => (
                              <li key={b.id}>
                                {b.sessionNumber} / {p.size} — {format(parseISO(b.dateISO), "d LLL", { locale: ru })}
                              </li>
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

      {/* модал добавления записи */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModalOpen(false)}>
          <div className="bg-white p-3 rounded w-72" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2 text-sm">Добавить запись</h3>
            <p className="text-[11px] mb-2">
              {modalDate && format(modalDate, "d LLL (EEE)", { locale: ru })}
              {" — "}
              {formatHourForTH(modalHour)} / {formatHourForRU(modalHour)}
            </p>
            <select
              value={modalClient}
              onChange={(e) => setModalClient(e.target.value)}
              className="border w-full px-2 py-1 rounded mb-3 text-[11px]"
            >
              <option value="">Выберите клиента</option>
              {clientNames().map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={addBooking} className="flex-1 bg-blue-600 text-white py-1 rounded text-[11px]">Сохранить</button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-200 py-1 rounded text-[11px]">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* модал добавления пакета */}
      {packageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPackageModalOpen(false)}>
          <div className="bg-white p-3 rounded w-72" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2 text-sm">Добавить пакет</h3>
            <input
              type="text"
              value={packageClient}
              onChange={(e) => setPackageClient(e.target.value)}
              placeholder="Имя клиента (можно несколько через запятую)"
              className="border w-full px-2 py-1 rounded mb-2 text-[11px]"
            />
            <select
              value={packageSize}
              onChange={(e) => setPackageSize(Number(e.target.value))}
              className="border w-full px-2 py-1 rounded mb-3 text-[11px]"
            >
              <option value={1}>1 трен.</option>
              <option value={5}>5 трен.</option>
              <option value={10}>10 трен.</option>
              <option value={20}>20 трен.</option>
            </select>
            <div className="flex gap-2">
              <button onClick={savePackage} className="flex-1 bg-blue-600 text-white py-1 rounded text-[11px]">Сохранить</button>
              <button onClick={() => setPackageModalOpen(false)} className="flex-1 bg-gray-200 py-1 rounded text-[11px]">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* подтверждение */}
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        onCancel={() => setConfirmState({ open: false, title: "", onConfirm: null })}
        onConfirm={() => { confirmState.onConfirm && confirmState.onConfirm(); }}
      />
    </div>
  );
}