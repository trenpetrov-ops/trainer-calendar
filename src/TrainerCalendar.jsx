import React, { useState, useEffect } from "react";
import { addDays, startOfWeek, format, addWeeks, subWeeks } from "date-fns";
import ruLocale from "date-fns/locale/ru";

// Теперь поддерживаются пакеты занятий (10 или 20).
// Хранится история пакетов для каждого клиента.
// В расписании показывается номер текущего занятия.

export default function TrainerCalendar() {
  const [anchorDate, setAnchorDate] = useState(new Date());

  // bookings: { id, dateISO, hour, clientName, packageIndex, sessionNumber }
  const [bookings, setBookings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("trainer_bookings_v7") || "[]");
    } catch {
      return [];
    }
  });

  // packages: { [clientName]: [ { size, used } ] }
  const [packages, setPackages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("trainer_packages_v4") || "{}");
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

  useEffect(() => {
    localStorage.setItem("trainer_bookings_v7", JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem("trainer_packages_v4", JSON.stringify(packages));
  }, [packages]);

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
    const ru = (thHour + 4) % 24;
    return `${String(ru).padStart(2, "0")}:00`;
  }

  function openBookingModal(date, hour) {
    setModalDate(date);
    setModalHour(hour);
    setModalClient("");
    setModalOpen(true);
  }

  function addBooking() {
    const name = modalClient.trim();
    if (!name) return;

    const pkgList = packages[name] || [];
    const currentPkg = pkgList[pkgList.length - 1];
    if (!currentPkg) {
      alert("Сначала нужно добавить пакет для этого клиента!");
      return;
    }
    if (currentPkg.used >= currentPkg.size) {
      alert("У клиента закончился пакет! Добавьте новый пакет.");
      return;
    }

    const dateISO = modalDate.toISOString().slice(0, 10);
    const exists = bookings.some((b) => b.dateISO === dateISO && b.hour === modalHour);
    if (exists) {
      alert("На это время уже есть запись!");
      return;
    }

    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    const sessionNumber = currentPkg.used + 1;
    const newBooking = {
      id,
      dateISO,
      hour: modalHour,
      clientName: name,
      packageIndex: pkgList.length - 1,
      sessionNumber,
    };

    const newBookings = [...bookings, newBooking];
    setBookings(newBookings);
    setPackages((p) => {
      const updated = [...pkgList];
      updated[updated.length - 1] = {
        ...currentPkg,
        used: currentPkg.used + 1,
      };
      return { ...p, [name]: updated };
    });

    setModalOpen(false);
  }

  function bookingsForDayHour(date, hour) {
    const dateISO = date.toISOString().slice(0, 10);
    return bookings.filter((b) => b.dateISO === dateISO && b.hour === hour);
  }

  function cancelBooking(id) {
    const booking = bookings.find((x) => x.id === id);
    if (!booking) return;
    if (!window.confirm("Удалить запись?")) return;

    const { clientName, packageIndex } = booking;
    const newBookings = bookings.filter((x) => x.id !== id);

    // пересчёт пакета
    const pkgList = packages[clientName] || [];
    if (pkgList[packageIndex]) {
      const updatedPkgList = [...pkgList];
      updatedPkgList[packageIndex] = {
        ...updatedPkgList[packageIndex],
        used: Math.max(0, updatedPkgList[packageIndex].used - 1),
      };
      setPackages({ ...packages, [clientName]: updatedPkgList });
    }

    // пересчёт sessionNumber для оставшихся занятий клиента
    const clientBookings = newBookings.filter((b) => b.clientName === clientName && b.packageIndex === packageIndex);
    clientBookings.sort((a, b) => (a.dateISO === b.dateISO ? a.hour - b.hour : a.dateISO.localeCompare(b.dateISO)));
    clientBookings.forEach((b, idx) => {
      b.sessionNumber = idx + 1;
    });

    setBookings([...newBookings]);
  }

  function clientStats() {
    const stats = {};
    for (const [name, pkgList] of Object.entries(packages)) {
      const currentPkg = pkgList[pkgList.length - 1];
      if (currentPkg) {
        stats[name] = `${currentPkg.used}/${currentPkg.size}`;
      }
    }
    return stats;
  }

  const stats = clientStats();

  function openPackageModal(clientName) {
    setPackageClient(clientName || "");
    setPackageSize(10);
    setPackageModalOpen(true);
  }

  function savePackage() {
    const name = packageClient.trim();
    if (!name) return;
    const pkgList = packages[name] || [];
    const currentPkg = pkgList[pkgList.length - 1];
    if (currentPkg && currentPkg.used < currentPkg.size) {
      alert("Нельзя добавить новый пакет, пока старый не израсходован!");
      return;
    }
    const newPkg = { size: packageSize, used: 0 };
    setPackages((p) => ({ ...p, [name]: [...(p[name] || []), newPkg] }));
    setPackageModalOpen(false);
  }

  return (
    <div className="p-4 font-sans max-w-full overflow-x-auto">
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
            <th className="border px-2 py-1 bg-[#ebebeb]">Тай<br/><span className="text-xs">(UTC+7)</span></th>
            <th className="border px-2 py-1 bg-[#ebebeb]">Рус<br/><span className="text-xs">(UTC+3)</span></th>
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
              <td className="border px-2 py-1 text-center bg-orange-100">{formatHourForTH(h)}</td>
              <td className="border px-2 py-1 text-center bg-orange-100">{formatHourForRU(h)}</td>
              {weekDays(anchorDate).map((day, idx) => (
                <td key={idx} className={`border align-top px-2 py-1 ${idx >= 5 ? "bg-orange-50" : ""}`}>
                  <div className="flex flex-col gap-1">
                    {bookingsForDayHour(day, h).map((b) => (
                      <div key={b.id} className="bg-blue-100 rounded px-1 flex justify-between items-center">
                        <span className="truncate max-w-[120px]">{b.clientName} #{b.sessionNumber}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => cancelBooking(b.id)} className="text-red-500 text-xs">✕</button>
                        </div>
                      </div>
                    ))}
                    {bookingsForDayHour(day, h).length === 0 && (
                      <button onClick={() => openBookingModal(day, h)} className="text-xs text-green-600">+ добавить</button>
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
        <ul className="space-y-1">
          {Object.entries(packages).map(([name, pkgList]) => (
            <li key={name} className="flex flex-col">
              <div className="flex justify-between">
                <span className="truncate max-w-[200px] font-semibold">{name}</span>
                <span>
                  {pkgList[pkgList.length - 1].used}/{pkgList[pkgList.length - 1].size} занятий
                  {pkgList[pkgList.length - 1].used >= pkgList[pkgList.length - 1].size && (
                    <button
                      onClick={() => openPackageModal(name)}
                      className="ml-2 text-xs text-blue-600 underline"
                    >
                      Новый пакет
                    </button>
                  )}
                </span>
              </div>
              <ul className="text-xs text-gray-600 ml-4 list-disc">
                {pkgList.map((pkg, i) => (
                  <li key={i}>
                    Пакет {pkg.size}: {pkg.used}/{pkg.size} занятий
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {Object.keys(packages).length === 0 && <li className="text-sm text-gray-500">Нет данных</li>}
        </ul>
        <div className="text-xs text-gray-500 mt-2">Разница между Тайландом и Москвой: 4 часа (например, 09:00 TH = 13:00 RU).</div>
        <div className="mt-2">
          <button onClick={() => openPackageModal("")} className="text-xs text-green-600">+ Добавить пакет клиенту</button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded w-80">
            <h3 className="font-semibold mb-2">Добавить запись</h3>
            <p className="text-sm mb-2">{modalDate && format(modalDate, "d LLL (EEE)", { locale: ruLocale })} — {formatHourForTH(modalHour)} (TH) / {formatHourForRU(modalHour)} (RU)</p>
            <input
              type="text"
              value={modalClient}
              onChange={(e) => setModalClient(e.target.value)}
              placeholder="Имя клиента"
              className="border w-full px-2 py-1 rounded mb-3"
            />
            <div className="flex gap-2">
              <button onClick={addBooking} className="flex-1 bg-blue-600 text-white py-1 rounded">Сохранить</button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-200 py-1 rounded">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {packageModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded w-80">
            <h3 className="font-semibold mb-2">Добавить пакет</h3>
            <input
              type="text"
              value={packageClient}
              onChange={(e) => setPackageClient(e.target.value)}
              placeholder="Имя клиента"
              className="border w-full px-2 py-1 rounded mb-3"
            />
            <select
              value={packageSize}
              onChange={(e) => setPackageSize(Number(e.target.value))}
              className="border w-full px-2 py-1 rounded mb-3"
            >
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
    </div>
  );
}
