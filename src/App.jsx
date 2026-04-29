import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Plus,
  Search,
  Wine,
  Warehouse,
  RefreshCw,
  ArrowLeftRight,
  ClipboardList,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "https://inventory-backend-x0w3.onrender.com/api";

const demoBottles = [
  {
    id: "btl-001",
    barcode: "890000000001",
    name: "Magic Moments Vodka",
    category: "Vodka",
    location: "Main Bar",
    capacityML: 750,
    emptyWeight: 420,
    fullWeight: 1170,
    quantity: 1,
    remainingML: null,
    lastWeight: null,
    lastChecked: null,
  },
  {
    id: "btl-002",
    barcode: "890000000002",
    name: "Black Label Whisky",
    category: "Whisky",
    location: "Stock Room",
    capacityML: 750,
    emptyWeight: 650,
    fullWeight: 1400,
    quantity: 1,
    remainingML: null,
    lastWeight: null,
    lastChecked: null,
  },
  {
    id: "btl-003",
    barcode: "890000000003",
    name: "Bacardi White Rum",
    category: "Rum",
    location: "Terrace Bar",
    capacityML: 750,
    emptyWeight: 390,
    fullWeight: 1140,
    quantity: 1,
    remainingML: null,
    lastWeight: null,
    lastChecked: null,
  },
];

const outletsSeed = [
  { id: "outlet-1", name: "Outlet 1", city: "Pune", bars: ["Main Bar", "Terrace Bar"], stockRoom: "Stock Room" },
  { id: "outlet-2", name: "Outlet 2", city: "Nagpur", bars: ["Main Bar"], stockRoom: "Stock Room" },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateRemainingML(weight, bottle) {
  if (!bottle) return 0;

  const emptyWeight = Number(bottle.emptyWeight ?? bottle.empty_weight ?? 0);
  const fullWeight = Number(bottle.fullWeight ?? bottle.full_weight ?? 0);
  const capacityML = Number(bottle.capacityML ?? bottle.capacity_ml ?? 750);

  const liquidWeight = Number(weight) - emptyWeight;
  const totalLiquidWeight = fullWeight - emptyWeight;

  if (!Number.isFinite(liquidWeight) || totalLiquidWeight <= 0) return 0;

  return clamp(Math.round((liquidWeight / totalLiquidWeight) * capacityML), 0, capacityML);
}

function formatTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [activeOutlet, setActiveOutlet] = useState(outletsSeed[0]);
  const [selectedLocation, setSelectedLocation] = useState("All");
  const [inventory, setInventory] = useState(demoBottles);
  const [selectedBottleId, setSelectedBottleId] = useState(demoBottles[0]?.id || "");
  const [recentInventory, setRecentInventory] = useState([]);
  const [isReading, setIsReading] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const selectedBottle = useMemo(
    () => inventory.find((item) => item.id === selectedBottleId) || inventory[0],
    [inventory, selectedBottleId]
  );

  const locations = useMemo(() => {
    const base = ["All", activeOutlet.stockRoom, ...activeOutlet.bars];
    return [...new Set(base)];
  }, [activeOutlet]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesLocation = selectedLocation === "All" || item.location === selectedLocation;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q);
      return matchesLocation && matchesSearch;
    });
  }, [inventory, search, selectedLocation]);

  const totalML = inventory.reduce((sum, item) => sum + Number(item.remainingML || 0), 0);
  const checkedCount = inventory.filter((item) => item.remainingML !== null && item.remainingML !== undefined).length;

  async function getWeightReading() {
    const res = await fetch(`${API_URL}/weight`, { cache: "no-store" });
    if (!res.ok) throw new Error("Weight API failed");
    const data = await res.json();

    const raw =
      data.weight ??
      data.value ??
      data.currentWeight ??
      data.current_weight ??
      data.grams ??
      data.data?.weight;

    const weight = Number(raw);
    if (!Number.isFinite(weight)) throw new Error("Invalid weight value");
    return weight;
  }

  async function readWeightFast(bottle = selectedBottle) {
    if (!bottle) {
      setToast("Please select a bottle first.");
      return;
    }

    try {
      setIsReading(true);
      setToast("");

      const w1 = await getWeightReading();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const w2 = await getWeightReading();

      const finalWeight = Math.round((Number(w1) + Number(w2)) / 2);
      const remainingML = calculateRemainingML(finalWeight, bottle);
      const takenAt = new Date().toISOString();

      setInventory((prev) =>
        prev.map((item) =>
          item.id === bottle.id
            ? { ...item, remainingML, lastWeight: finalWeight, lastChecked: takenAt }
            : item
        )
      );

      const recent = {
        id: `${Date.now()}-${bottle.id}`,
        bottleId: bottle.id,
        bottleName: bottle.name,
        barcode: bottle.barcode,
        location: bottle.location,
        remainingML,
        finalWeight,
        time: takenAt,
      };

      setRecentInventory((prev) => [recent, ...prev.slice(0, 9)]);

      fetch(`${API_URL}/inventory/recent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recent),
      }).catch(() => {});

      setToast(`${bottle.name} updated: ${remainingML} ml`);
    } catch (error) {
      console.error(error);
      setToast("Weight read failed. Check backend / scale connection.");
    } finally {
      setIsReading(false);
    }
  }

  function handleBarcodeSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const barcode = String(form.get("barcode") || "").trim();
    if (!barcode) return;

    const found = inventory.find((item) => item.barcode === barcode);
    if (found) {
      setSelectedBottleId(found.id);
      setToast(`${found.name} selected. Reading weight...`);
      setTimeout(() => readWeightFast(found), 50);
    } else {
      setToast("Barcode not found in inventory.");
    }

    e.currentTarget.reset();
  }

  function transferSelectedBottle() {
    if (!selectedBottle) return;

    const allLocations = [activeOutlet.stockRoom, ...activeOutlet.bars];
    const currentIndex = allLocations.indexOf(selectedBottle.location);
    const nextLocation = allLocations[(currentIndex + 1) % allLocations.length];

    setInventory((prev) =>
      prev.map((item) =>
        item.id === selectedBottle.id ? { ...item, location: nextLocation } : item
      )
    );

    setToast(`${selectedBottle.name} transferred to ${nextLocation}`);
  }

  useEffect(() => {
    if (!locations.includes(selectedLocation)) setSelectedLocation("All");
  }, [locations, selectedLocation]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon"><Wine size={24} /></div>
          <div>
            <h1>Siroo</h1>
            <p>Inventory Control</p>
          </div>
        </div>

        <div className="sideSection">
          <p className="sideLabel">Outlets</p>
          {outletsSeed.map((outlet) => (
            <button
              key={outlet.id}
              className={`outletBtn ${activeOutlet.id === outlet.id ? "active" : ""}`}
              onClick={() => setActiveOutlet(outlet)}
            >
              <Building2 size={18} />
              <span>{outlet.name}</span>
            </button>
          ))}
        </div>

        <div className="sideSection">
          <p className="sideLabel">Sections</p>
          {locations.map((location) => (
            <button
              key={location}
              className={`outletBtn ${selectedLocation === location ? "active light" : ""}`}
              onClick={() => setSelectedLocation(location)}
            >
              {location === "Stock Room" ? <Warehouse size={18} /> : <Wine size={18} />}
              <span>{location}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Alcohol Inventory Management</p>
            <h2>{activeOutlet.name}</h2>
            <p className="muted">{activeOutlet.city} · {selectedLocation}</p>
          </div>

          <button className="primaryBtn">
            <Plus size={18} />
            Add Bottle
          </button>
        </header>

        {toast && <div className="toast">{toast}</div>}

        <section className="statsGrid">
          <div className="statCard">
            <p>Total SKU</p>
            <h3>{inventory.length}</h3>
          </div>
          <div className="statCard">
            <p>Checked Bottles</p>
            <h3>{checkedCount}</h3>
          </div>
          <div className="statCard">
            <p>Recorded ML</p>
            <h3>{totalML} ml</h3>
          </div>
        </section>

        <section className="scannerCard">
          <div>
            <h3>Quick Bottle Scan</h3>
            <p>Scan barcode or select bottle, then read weight. Only 2 readings are used.</p>
          </div>

          <form onSubmit={handleBarcodeSubmit} className="barcodeForm">
            <input name="barcode" placeholder="Scan barcode here..." autoComplete="off" />
            <button type="submit">Scan</button>
          </form>
        </section>

        <section className="inventoryLayout">
          <div className="panel">
            <div className="panelHeader">
              <div>
                <h3>Inventory</h3>
                <p>Remaining ML updates directly in the table column.</p>
              </div>

              <div className="searchBox">
                <Search size={16} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bottle..." />
              </div>
            </div>

            <div className="recentInventory">
              <div className="miniHeader">
                <ClipboardList size={18} />
                <h4>Recent Inventory</h4>
              </div>

              {recentInventory.length === 0 ? (
                <p className="emptyText">No recent inventory taken yet.</p>
              ) : (
                <div className="recentList">
                  {recentInventory.map((item) => (
                    <div className="recentItem" key={item.id}>
                      <div>
                        <strong>{item.bottleName}</strong>
                        <p>{item.location} · {formatTime(item.time)}</p>
                      </div>
                      <span>{item.remainingML} ml</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Bottle</th>
                    <th>Barcode</th>
                    <th>Location</th>
                    <th>Capacity</th>
                    <th>Remaining ML</th>
                    <th>Last Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item) => (
                    <tr
                      key={item.id}
                      className={selectedBottleId === item.id ? "selectedRow" : ""}
                      onClick={() => setSelectedBottleId(item.id)}
                    >
                      <td>
                        <strong>{item.name}</strong>
                        <p>{item.category}</p>
                      </td>
                      <td>{item.barcode}</td>
                      <td>{item.location}</td>
                      <td>{item.capacityML} ml</td>
                      <td className="remainingCell">
                        {item.remainingML !== null && item.remainingML !== undefined ? `${item.remainingML} ml` : "--"}
                      </td>
                      <td>{formatTime(item.lastChecked)}</td>
                    </tr>
                  ))}

                  {filteredInventory.length === 0 && (
                    <tr>
                      <td colSpan="6" className="emptyTable">No bottles found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="readPanel">
            <p className="eyebrow">Selected Bottle</p>
            <h3>{selectedBottle?.name || "No bottle selected"}</h3>
            <p className="muted">{selectedBottle?.barcode}</p>

            <div className="remainingBox">
              <div>
                <p>Remaining ML</p>
                <h2>
                  {selectedBottle?.remainingML !== null && selectedBottle?.remainingML !== undefined
                    ? `${selectedBottle.remainingML} ml`
                    : "-- ml"}
                </h2>
              </div>

              <button onClick={() => readWeightFast(selectedBottle)} disabled={isReading}>
                <RefreshCw size={18} className={isReading ? "spin" : ""} />
                {isReading ? "Reading..." : "Read Again"}
              </button>
            </div>

            <div className="detailGrid">
              <div><p>Capacity</p><strong>{selectedBottle?.capacityML || "--"} ml</strong></div>
              <div><p>Location</p><strong>{selectedBottle?.location || "--"}</strong></div>
              <div><p>Empty Wt.</p><strong>{selectedBottle?.emptyWeight || "--"} g</strong></div>
              <div><p>Full Wt.</p><strong>{selectedBottle?.fullWeight || "--"} g</strong></div>
            </div>

            <button className="secondaryBtn" onClick={transferSelectedBottle}>
              <ArrowLeftRight size={18} />
              Transfer Bottle
            </button>

            <p className="note">
              Live weight and stable weight are hidden. The system directly shows Remaining ML using only 2 readings.
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}
