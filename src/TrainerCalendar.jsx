import React, { useState, useEffect } from "react";
import { addDays, startOfWeek, format, addWeeks, subWeeks, parseISO } from "date-fns";
import ruLocale from "date-fns/locale/ru";

export default function TrainerCalendar() {
  const [anchorDate, setAnchorDate] = useState(new Date());

  const [bookings, setBookings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("trainer_bookings_v_final") || "[]");
    } catch {
      return [];
    }
  });

  const [packages, setPackages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("trainer_packages_v_final") || "{}");
    } catch {
      return {};
    }
  });

  // payments: { [clientName]: [ { amount: number|string, day: string } ] }
  // we store only day (e.g. "15") so when user flips month the day stays and month displays from anchorDate
  const [payments, setPayments] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("trainer_payments_v_final") || "{}");
    } catch {
      return {};
    }
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [modalHour, setModalHour] = useState(9);
  const [modalClient, setModalClient] = useState("");
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [packageClient, setPackageClient] = useState("");
  const [packageSize, setPackageSize] = useState(10);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentClient, setPaymentClient] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDay, setPaymentDay] = useState("");

  const [expandedClients, setExpandedClients] = useState({}); // which clients have expanded detail
  const [selectedBooking, setSelectedBooking] = useState(null); // booking id that was clicked (shows delete button)

  useEffect(() => {
    localStorage.setItem("trainer_bookings_v_final", JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem("trainer_packages_v_final", JSON.stringify(packages));
  }, [packages]);

  useEffect(() => {
    localStorage.setItem("trainer_payments_v_final", JSON.stringify(payments));
  }, [payments]);

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
    // Русское время = Тайское - 4 часа (displayed as TH - 4)
    const ru = (thHour + 24 - 4) % 24;
    return `${String(ru).padStart(2, "0")}:00`;
  }

  function openBookingModal(date, hour) {
    setModalDate(date);
    setModalHour(hour);
    // default to first active client if exists
    const active = activeClients();
    setModalClient(active.length > 0 ? active[0] : "");
    setModalOpen(true);
  }

  function activeClients() {
    return Object.entries(packages)
      .filter(([_, pkgList]) => {
        if (!pkgList || pkgList.length === 0) return false;
        const current = pkgList[pkgList.length - 1];
        return current && current.used < current.size;
      })
      .map(([name]) => name);
  }

  function addBooking() {
    const name = modalClient.trim();
    if (!name) {
      alert("Выберите клиента из списка.");
      return;
    }
    const pkgList = packages[name] || [];
    const currentPkg = pkgList[pkgList.length - 1];
    if (!currentPkg) {
      alert("Сначала добавьте пакет для этого клиента.");
      return;
    }
    if (currentPkg.used >= currentPkg.size) {
      alert("У клиента закончился пакет.");
      return;
    }

    const dateISO = modalDate.toISOString().slice(0, 10);
    const exists = bookings.some((b) => b.dateISO === dateISO && b.hour === modalHour);
    if (exists) {
      alert("На это время уже есть запись.");
      return;
    }

    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    const sessionNumber = currentPkg.used + 1;
    setBookings((prev) => [
      ...prev,
      { id, dateISO, hour: modalHour, clientName: name, packageIndex: pkgList.length - 1, sessionNumber },
    ]);

    setPackages((prev) => {
      const copy = { ...prev };
      const list = [...(copy[name] || [])];
      const last = { ...list[list.length - 1] };
      last.used = (last.used || 0) + 1;
      list[list.length - 1] = last;
      copy[name] = list;
      return copy;
    });

    setModalOpen(false);
  }

  function bookingsForDayHour(date, hour) {
    const dateISO = date.toISOString().slice(0, 10);
    return bookings.filter((b) => b.dateISO === dateISO && b.hour === hour);
  }

  function deleteBooking(id) {
    if (!confirm("Удалить запись?")) return;
    const b = bookings.find((x) => x.id === id);
    if (b) {
      setPackages((prev) => {
        const copy = { ...prev };
        const list = copy[b.clientName] ? [...copy[b.clientName]] : [];
        if (list[b.packageIndex]) {
          list[b.packageIndex] = { ...list[b.packageIndex], used: Math.max(0, list[b.packageIndex].used - 1) };
        }
        copy[b.clientName] = list;
        return copy;
      });
    }
    setBookings((prev) => prev.filter((x) => x.id !== id));
    setSelectedBooking(null);
  }

  function openPackageModal(clientName) {
    setPackageClient(clientName || "");
    setPackageSize(10);
    setPackageModalOpen(true);
  }

  function savePackage() {
    const name = packageClient.trim();
    if (!name) return;
    const list = packages[name] || [];
    const current = list[list.length - 1];
    if (current && current.used < current.size) {
      alert("Нельзя добавить новый пакет, пока старый не израсходован.");
      return;
    }
    const newPkg = { size: packageSize, used: 0 };
    setPackages((prev) => ({ ...prev, [name]: [...(prev[name] || []), newPkg] }));
    setPackageModalOpen(false);
  }

  function openPaymentModal(clientName) {
    setPaymentClient(clientName || "");
    setPaymentAmount("");
    setPaymentDay("");
    setPaymentModalOpen(true);
  }

  function savePayment() {
    const name = paymentClient.trim();
    if (!name) {
      alert("Введите имя клиента.");
      return;
    }
    if (!paymentAmount) {
      alert("Введите сумму.");
      return;
    }
    if (!paymentDay) {
      alert("Введите число (день месяца).");
      return;
    }
    const newPayment = { amount: paymentAmount, day: paymentDay };
    setPayments((prev) => ({ ...prev, [name]: [...(prev[name] || []), newPayment] }));
    setPaymentModalOpen(false);
  }

  function toggleClientExpand(name) {
    setExpandedClients((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  // remove client from lists (packages/payments) but KEEP calendar bookings
  function removeClientFromList(name) {
    if (!confirm("Удалить клиента из списка? (Записи в календаре останутся)")) return;
    setPackages((prev) => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
    setPayments((prev) => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
  }

  function removePayment(name, index) {
    setPayments((prev) => {
      const copy = { ...(prev || {}) };
      if (!copy[name]) return prev;
      copy[name] = copy[name].filter((_, i) => i !== index);
      return copy;
    });
  }

  // helper to format booking date for expanded list
  function formatBookingDate(dateISO) {
    try {
      const parsed = parseISO(dateISO);
      return format(parsed, "d LLL", { locale: ruLocale });
    } catch {
      return dateISO;
    }
  }

  // helper render of payments - show day + month from anchorDate
  function renderPaymentLabel(pay) {
    const monthName = format(anchorDate, "LLL", { locale: ruLocale });
    return `${pay.amount}₽ (${pay.day} ${monthName})`;
  }

  // click outside handler - clicking top-level container clears selected booking
  function onContainerClick() {
    setSelectedBooking(null);
  }

  return (
    <div className="p-4 font-sans max-w-full overflow-x-auto" onClick={onContainerClick}>
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Тренировочный календарь</h1>
        <div className="flex gap-2">
          <button onClick={() => setAnchorDate(subWeeks(anchorDate, 1))} className="px-2 py-1 bg-gray-100 rounded">← Неделя</button>
          <button onClick={() => setAnchorDate(new Date())} className="px-2 py-1 bg-gray-100 rounded">Сегодня</button>
          <button onClick={() => setAnchorDate(addWeeks(anchorDate, 1))} className="px-2 py-1 bg-gray-100 rounded">Неделя →</button>
        </div>
      </header>

      <table className="border-collapse w-full text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1 bg-yellow-300">Тай<br/><span className="text-xs">(UTC+7)</span></th>
            <th className="border px-2 py-1 bg-gray-300">Рус<br/><span className="text-xs">(UTC+3)</span></th>
            {weekDays(anchorDate).map((day, idx) => (
              <th key={idx} className={`border px-2 py-1 ${idx >= 5 ? "bg-orange-100" : "bg-red-100"}`}>
                <div className="font-bold">{format(day, "d LLL", { locale: ruLocale })}</div>
                <div>{format(day, "EEE", { locale: ruLocale })}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h}>
              <td className="border px-2 py-1 text-center bg-yellow-100">{formatHourForTH(h)}</td>
              <td className="border px-2 py-1 text-center bg-gray-100">{formatHourForRU(h)}</td>
              {weekDays(anchorDate).map((day, idx) => (
                <td key={idx} className={`border align-top px-2 py-1 ${idx >= 5 ? "bg-orange-50" : ""}`}>
                  <div className="flex flex-col gap-1">
                    {bookingsForDayHour(day, h).map((b) => (
                      <div
                        key={b.id}
                        className="bg-blue-100 rounded px-1 flex justify-between items-center cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setSelectedBooking(selectedBooking === b.id ? null : b.id); }}
                      >
                        <span className="truncate max-w-[140px] text-center">{b.clientName} - {b.sessionNumber}</span>
                        {selectedBooking === b.id && (
                          <button onClick={(e) => { e.stopPropagation(); deleteBooking(b.id); }} className="text-red-500 text-xs ml-2">✕</button>
                        )}
                      </div>
                    ))}
                    {bookingsForDayHour(day, h).length === 0 && (
                      <div className="h-6 flex items-center">
                        <button onClick={(e) => { e.stopPropagation(); openBookingModal(day, h); }} className="text-xs text-green-600">+ добавить</button>
                      </div>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 p-4 border rounded bg-gray-50">
        <h2 className="font-semibold mb-2">Прогресс клиентов</h2>
        <ul className="space-y-2">
          {Object.entries(packages).map(([name, pkgList]) => {
            const currentPkg = pkgList[pkgList.length - 1];
            return (
              <li key={name} className="flex flex-col">
                <div className="flex justify-between items-center cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleClientExpand(name); }}>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{name}</span>
                    <span className="text-xs text-gray-600">{currentPkg ? `${currentPkg.used}/${currentPkg.size}` : ""}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {payments[name]?.map((pay, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-xs text-gray-600">{renderPaymentLabel(pay)}</span>
                        <button onClick={(e) => { e.stopPropagation(); removePayment(name, i); }} className="text-red-400 text-[10px]">✕</button>
                      </div>
                    ))}
                    {currentPkg && currentPkg.used >= currentPkg.size && (
                      <button onClick={(e) => { e.stopPropagation(); removeClientFromList(name); }} className="text-red-500 text-xs">✕</button>
                    )}
                  </div>
                </div>

                {expandedClients[name] && (
                  <ul className="text-xs text-gray-600 ml-4 list-disc mt-1">
                    {bookings.filter((b) => b.clientName === name).map((b) => (
                      <li key={b.id}>{b.sessionNumber}/{(packages[name] && packages[name][b.packageIndex]) ? packages[name][b.packageIndex].size : "?"} – {formatBookingDate(b.dateISO)}</li>
                    ))}
                    { (bookings.filter((b) => b.clientName === name).length === 0) && (
                      <li>Нет записей</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}

          {Object.keys(packages).length === 0 && <li className="text-sm text-gray-500">Нет данных</li>}
        </ul>

        <div className="mt-2 flex gap-4">
          <button onClick={() => openPackageModal("")} className="text-xs text-green-600">+ Добавить пакет клиенту</button>
          <button onClick={() => openPaymentModal("")} className="text-xs text-green-600">+ Добавить оплату</button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-white p-4 rounded w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Добавить запись</h3>
            <p className="text-sm mb-2">{modalDate && format(modalDate, "d LLL (EEE)", { locale: ruLocale })} — {formatHourForTH(modalHour)} (TH) / {formatHourForRU(modalHour)} (RU)</p>
            <select value={modalClient} onChange={(e) => setModalClient(e.target.value)} className="border w-full px-2 py-1 rounded mb-3">
              <option value="">Выберите клиента</option>
              {activeClients().map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <div className="flex gap-2">
              <button onClick={addBooking} className="flex-1 bg-blue-600 text-white py-1 rounded">Сохранить</button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-200 py-1 rounded">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {packageModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPackageModalOpen(false)}>
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

      {paymentModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPaymentModalOpen(false)}>
          <div className="bg-white p-4 rounded w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Добавить оплату</h3>
            <select value={paymentClient} onChange={(e) => setPaymentClient(e.target.value)} className="border w-full px-2 py-1 rounded mb-3">
              <option value="">Выберите клиента</option>
              {Object.keys(packages).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="text" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Сумма (например, 12000)" className="border w-full px-2 py-1 rounded mb-3" />
            <input type="text" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} placeholder="Число месяца (например, 15)" className="border w-full px-2 py-1 rounded mb-3" />
            <div className="flex gap-2">
              <button onClick={savePayment} className="flex-1 bg-blue-600 text-white py-1 rounded">Сохранить</button>
              <button onClick={() => setPaymentModalOpen(false)} className="flex-1 bg-gray-200 py-1 rounded">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
