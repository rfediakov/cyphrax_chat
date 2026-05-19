import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../store/settings.store';
import {
  getPrivacySettings,
  updatePrivacy,
  updateNotifications,
  updateSafety,
  updateLocationSettings,
  addGeofence,
  deleteGeofence,
  type PrivacyLevel,
  type Geofence,
} from '../api/privacy.api';

type Tab = 'account' | 'privacy' | 'notifications' | 'location' | 'safety' | 'parental';

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'location', label: 'Location' },
  { id: 'safety', label: 'Safety' },
  { id: 'parental', label: 'Parental' },
];

const PRIVACY_OPTIONS: { value: PrivacyLevel; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'contacts', label: 'Contacts only' },
  { value: 'nobody', label: 'Nobody' },
];

const HISTORY_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string | number; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  sublabel,
  checked,
  onChange,
  disabled,
  locked,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
      <div>
        <p className="text-sm text-gray-300 flex items-center gap-1.5">
          {label}
          {locked && <span className="text-yellow-400 text-xs">🔒</span>}
        </p>
        {sublabel && <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && !locked && onChange(!checked)}
        disabled={disabled || locked}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${
          checked ? 'bg-blue-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
      {title && <h2 className="text-sm font-bold text-white mb-4">{title}</h2>}
      {children}
    </section>
  );
}

// ─── Tab: Privacy ──────────────────────────────────────────────────────────────
function PrivacyTab({
  restricted,
}: {
  restricted: boolean;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const [saving, setSaving] = useState(false);

  const handleChange = useCallback(
    async (field: Parameters<typeof updatePrivacy>[0], value: PrivacyLevel) => {
      if (restricted) return;
      setSaving(true);
      try {
        await updatePrivacy({ [field as string]: value });
        patchSettings({ [field as string]: value } as never);
      } finally {
        setSaving(false);
      }
    },
    [restricted, patchSettings],
  );

  if (!settings) return null;

  const privacyRows: { label: string; field: keyof typeof settings }[] = [
    { label: 'Location visibility', field: 'privacyLocation' },
    { label: 'Battery visibility', field: 'privacyBattery' },
    { label: 'Online status', field: 'privacyOnlineStatus' },
    { label: 'Last seen', field: 'privacyLastSeen' },
    { label: 'Profile visible to', field: 'privacyProfile' },
  ];

  return (
    <div className="space-y-4">
      {restricted && (
        <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-3">
          <span className="text-yellow-400">🔒</span>
          <p className="text-sm text-yellow-300">Privacy settings are locked in restricted mode.</p>
        </div>
      )}
      <SectionCard title="Who can see…">
        {privacyRows.map(({ label, field }) => (
          <SelectField
            key={field}
            label={label}
            value={settings[field] as string}
            options={PRIVACY_OPTIONS}
            onChange={(v) => handleChange(field as Parameters<typeof updatePrivacy>[0], v as PrivacyLevel)}
            disabled={saving || restricted}
          />
        ))}
      </SectionCard>
    </div>
  );
}

// ─── Tab: Notifications ────────────────────────────────────────────────────────
function NotificationsTab() {
  const settings = useSettingsStore((s) => s.settings);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const [saving, setSaving] = useState(false);

  const toggle = useCallback(
    async (field: keyof NonNullable<typeof settings>['notificationPrefs'], value: boolean) => {
      if (!settings) return;
      setSaving(true);
      try {
        const updated = { ...settings.notificationPrefs, [field]: value };
        await updateNotifications({ [field]: value });
        patchSettings({ notificationPrefs: updated });
      } finally {
        setSaving(false);
      }
    },
    [settings, patchSettings],
  );

  if (!settings) return null;
  const prefs = settings.notificationPrefs;

  return (
    <div className="space-y-4">
      <SectionCard title="Notifications">
        <Toggle
          label="Push notifications"
          sublabel="Enabled via browser"
          checked={prefs.pushEnabled}
          onChange={(v) => toggle('pushEnabled', v)}
          disabled={saving}
        />
        <Toggle
          label="SOS alerts"
          sublabel="Always ON — cannot be disabled"
          checked={true}
          onChange={() => {}}
          locked
        />
        <Toggle
          label="New messages"
          checked={prefs.newMessages}
          onChange={(v) => toggle('newMessages', v)}
          disabled={saving}
        />
        <Toggle
          label="Missed calls"
          checked={prefs.missedCalls}
          onChange={(v) => toggle('missedCalls', v)}
          disabled={saving}
        />
        <Toggle
          label="Location requests"
          checked={prefs.locationRequests}
          onChange={(v) => toggle('locationRequests', v)}
          disabled={saving}
        />
        <Toggle
          label="Low battery alerts"
          checked={prefs.lowBatteryAlerts}
          onChange={(v) => toggle('lowBatteryAlerts', v)}
          disabled={saving}
        />
      </SectionCard>
    </div>
  );
}

// ─── Tab: Location ─────────────────────────────────────────────────────────────
function LocationTab({ restricted }: { restricted: boolean }) {
  const settings = useSettingsStore((s) => s.settings);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const [saving, setSaving] = useState(false);

  const handleToggleSharing = useCallback(
    async (value: boolean) => {
      if (restricted || !settings) return;
      setSaving(true);
      try {
        await updateLocationSettings({ locationSharingActive: value });
        patchSettings({ locationSharingActive: value });
      } finally {
        setSaving(false);
      }
    },
    [restricted, settings, patchSettings],
  );

  const handleHistoryChange = useCallback(
    async (v: string) => {
      if (restricted || !settings) return;
      const days = parseInt(v, 10);
      setSaving(true);
      try {
        await updateLocationSettings({ locationHistory: days });
        patchSettings({ locationHistory: days });
      } finally {
        setSaving(false);
      }
    },
    [restricted, settings, patchSettings],
  );

  if (!settings) return null;

  return (
    <div className="space-y-4">
      {restricted && (
        <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-3">
          <span className="text-yellow-400">🔒</span>
          <p className="text-sm text-yellow-300">Location settings are locked in restricted mode.</p>
        </div>
      )}
      <SectionCard title="Location Sharing">
        <Toggle
          label="Share location"
          checked={settings.locationSharingActive}
          onChange={handleToggleSharing}
          disabled={saving || restricted}
          locked={restricted}
        />
        <SelectField
          label="Location history"
          value={String(settings.locationHistory)}
          options={HISTORY_OPTIONS.map((o) => ({ ...o, value: String(o.value) }))}
          onChange={handleHistoryChange}
          disabled={saving || restricted}
        />
      </SectionCard>
      <SectionCard>
        <p className="text-xs text-gray-500">
          To share location with specific rooms or contacts, use the Map page.
        </p>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Safety ───────────────────────────────────────────────────────────────
function SafetyTab() {
  const settings = useSettingsStore((s) => s.settings);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const [saving, setSaving] = useState(false);
  const [newPreset, setNewPreset] = useState('');

  const handleAddPreset = useCallback(async () => {
    if (!settings || !newPreset.trim()) return;
    const presets = [...(settings.sosMessagePresets ?? []), newPreset.trim()].slice(0, 5);
    setSaving(true);
    try {
      await updateSafety({ sosMessagePresets: presets });
      patchSettings({ sosMessagePresets: presets });
      setNewPreset('');
    } finally {
      setSaving(false);
    }
  }, [settings, newPreset, patchSettings]);

  const handleRemovePreset = useCallback(
    async (idx: number) => {
      if (!settings) return;
      const presets = settings.sosMessagePresets.filter((_, i) => i !== idx);
      setSaving(true);
      try {
        await updateSafety({ sosMessagePresets: presets });
        patchSettings({ sosMessagePresets: presets });
      } finally {
        setSaving(false);
      }
    },
    [settings, patchSettings],
  );

  const handleAutoSosToggle = useCallback(
    async (value: boolean) => {
      if (!settings) return;
      setSaving(true);
      try {
        await updateSafety({ autoSosEnabled: value });
        patchSettings({ autoSosEnabled: value });
      } finally {
        setSaving(false);
      }
    },
    [settings, patchSettings],
  );

  const handleThresholdChange = useCallback(
    async (v: string) => {
      if (!settings) return;
      const hours = parseFloat(v);
      if (isNaN(hours) || hours < 1) return;
      setSaving(true);
      try {
        await updateSafety({ autoSosThresholdHours: hours });
        patchSettings({ autoSosThresholdHours: hours });
      } finally {
        setSaving(false);
      }
    },
    [settings, patchSettings],
  );

  if (!settings) return null;

  return (
    <div className="space-y-4">
      <SectionCard title="SOS Message Presets">
        <div className="space-y-2 mb-3">
          {settings.sosMessagePresets.length === 0 && (
            <p className="text-xs text-gray-500">No presets yet. Add up to 5.</p>
          )}
          {settings.sosMessagePresets.map((preset, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-gray-300 bg-gray-800 rounded-lg px-3 py-2">
                {preset}
              </span>
              <button
                onClick={() => handleRemovePreset(i)}
                disabled={saving}
                className="text-red-400 hover:text-red-300 text-sm px-2 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {settings.sosMessagePresets.length < 5 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newPreset}
              onChange={(e) => setNewPreset(e.target.value)}
              placeholder="e.g. I need help at my location"
              maxLength={120}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAddPreset}
              disabled={saving || !newPreset.trim()}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg"
            >
              Add
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Auto-SOS on Inactivity">
        <Toggle
          label="Auto-SOS on inactivity"
          sublabel="Send SOS if no activity detected after the threshold"
          checked={settings.autoSosEnabled}
          onChange={handleAutoSosToggle}
          disabled={saving}
        />
        {settings.autoSosEnabled && (
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-300">After</span>
            <select
              value={settings.autoSosThresholdHours}
              onChange={(e) => handleThresholdChange(e.target.value)}
              disabled={saving}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[1, 2, 4, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? 'hour' : 'hours'}
                </option>
              ))}
            </select>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Emergency Contacts">
        <p className="text-xs text-gray-500">
          Emergency contacts receive SOS notifications. Add contacts via the Contacts page.
        </p>
        {settings.emergencyContacts.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">No emergency contacts added.</p>
        ) : (
          <p className="text-sm text-gray-400 mt-2">{settings.emergencyContacts.length} contact(s)</p>
        )}
        <Link
          to="/contacts"
          className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300"
        >
          Manage contacts →
        </Link>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Parental ─────────────────────────────────────────────────────────────
function ParentalTab() {
  const settings = useSettingsStore((s) => s.settings);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const [saving, setSaving] = useState(false);

  // Geofence form state
  const [showAddZone, setShowAddZone] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneLat, setZoneLat] = useState('');
  const [zoneLng, setZoneLng] = useState('');
  const [zoneRadius, setZoneRadius] = useState('100');
  const [zoneAlertExit, setZoneAlertExit] = useState(true);
  const [zoneAlertEntry, setZoneAlertEntry] = useState(false);

  const handleAddZone = useCallback(async () => {
    const lat = parseFloat(zoneLat);
    const lng = parseFloat(zoneLng);
    const radius = parseFloat(zoneRadius);
    if (!zoneName.trim() || isNaN(lat) || isNaN(lng) || isNaN(radius) || radius < 10) return;

    setSaving(true);
    try {
      const res = await addGeofence({
        name: zoneName.trim(),
        lat,
        lng,
        radiusMetres: radius,
        alertOnExit: zoneAlertExit,
        alertOnEntry: zoneAlertEntry,
      });
      patchSettings({ geofences: res.data.geofences });
      setShowAddZone(false);
      setZoneName('');
      setZoneLat('');
      setZoneLng('');
      setZoneRadius('100');
    } finally {
      setSaving(false);
    }
  }, [zoneName, zoneLat, zoneLng, zoneRadius, zoneAlertExit, zoneAlertEntry, patchSettings]);

  const handleDeleteZone = useCallback(
    async (id: string) => {
      if (!settings) return;
      setSaving(true);
      try {
        await deleteGeofence(id);
        patchSettings({ geofences: settings.geofences.filter((z: Geofence) => z._id !== id) });
      } finally {
        setSaving(false);
      }
    },
    [settings, patchSettings],
  );

  if (!settings) return null;

  return (
    <div className="space-y-4">
      <SectionCard title="Restricted Mode (Child Mode)">
        <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-800/50 rounded-xl p-3 mb-4">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-medium text-yellow-300 mb-1">Restricted mode</p>
            <ul className="text-xs text-yellow-200/70 space-y-0.5 list-disc list-inside">
              <li>Location always shared with guardians</li>
              <li>Cannot disable location sharing</li>
              <li>Cannot change privacy settings</li>
              <li>SOS button always visible</li>
              <li>Geofence alerts active</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-300">Restricted mode (own account)</span>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              settings.restrictedMode
                ? 'bg-yellow-900/50 text-yellow-300'
                : 'bg-gray-800 text-gray-400'
            }`}
          >
            {settings.restrictedMode ? 'Active' : 'Off'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Restricted mode is toggled by guardians. Guardians can manage this via their guardian
          dashboard.
        </p>
      </SectionCard>

      <SectionCard title="Guardians">
        {settings.guardianIds.length === 0 ? (
          <p className="text-sm text-gray-400">No guardians linked to your account.</p>
        ) : (
          <p className="text-sm text-gray-400">{settings.guardianIds.length} guardian(s) linked.</p>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Guardians can see your location, manage geofences, and toggle restricted mode.
        </p>
      </SectionCard>

      <SectionCard title="Geofence Zones">
        {settings.geofences.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">No zones configured.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {settings.geofences.map((zone: Geofence) => (
              <div
                key={zone._id}
                className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2"
              >
                <div>
                  <p className="text-sm text-white font-medium">{zone.name}</p>
                  <p className="text-xs text-gray-400">
                    {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)} · {zone.radiusMetres}m
                    {zone.alertOnExit && ' · exit alert'}
                    {zone.alertOnEntry && ' · entry alert'}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteZone(zone._id)}
                  disabled={saving}
                  className="text-red-400 hover:text-red-300 text-sm ml-2 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!showAddZone ? (
          <button
            onClick={() => setShowAddZone(true)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            + Add zone
          </button>
        ) : (
          <div className="space-y-3 border border-gray-700 rounded-xl p-3 mt-2">
            <p className="text-sm font-medium text-white">New geofence zone</p>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="Zone name (e.g. Home, School)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={zoneLat}
                onChange={(e) => setZoneLat(e.target.value)}
                placeholder="Latitude"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="number"
                value={zoneLng}
                onChange={(e) => setZoneLng(e.target.value)}
                placeholder="Longitude"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={zoneRadius}
                onChange={(e) => setZoneRadius(e.target.value)}
                placeholder="Radius (metres)"
                min="10"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">metres</span>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={zoneAlertExit}
                  onChange={(e) => setZoneAlertExit(e.target.checked)}
                  className="rounded"
                />
                Alert on exit
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={zoneAlertEntry}
                  onChange={(e) => setZoneAlertEntry(e.target.checked)}
                  className="rounded"
                />
                Alert on entry
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddZone}
                disabled={saving || !zoneName.trim() || !zoneLat || !zoneLng}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg"
              >
                {saving ? 'Saving…' : 'Save zone'}
              </button>
              <button
                onClick={() => setShowAddZone(false)}
                className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab: Account ──────────────────────────────────────────────────────────────
function AccountTab() {
  return (
    <div className="space-y-4">
      <SectionCard>
        <p className="text-sm text-gray-300 mb-3">
          Manage your account credentials and data on the Profile page.
        </p>
        <Link
          to="/profile"
          className="inline-block px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-white rounded-lg transition-colors"
        >
          Go to Profile →
        </Link>
      </SectionCard>
    </div>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('privacy');
  const { settings, loading, setSettings, setLoading } = useSettingsStore();

  useEffect(() => {
    setLoading(true);
    getPrivacySettings()
      .then(({ data }) => setSettings(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setSettings, setLoading]);

  const isRestricted = settings?.restrictedMode ?? false;

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Parental controls banner */}
      {isRestricted && (
        <div className="sticky top-0 z-40 flex items-center gap-2 bg-yellow-600 px-4 py-2">
          <span>🔒</span>
          <p className="text-sm font-medium text-white">
            Parental controls active — some settings are locked
          </p>
        </div>
      )}

      {/* Header */}
      <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
            </svg>
          </div>
          <span className="font-bold text-white text-sm">SafeGroup</span>
        </Link>
        <span className="text-gray-500 text-sm">/</span>
        <span className="text-sm text-gray-300">Settings</span>
      </header>

      {/* Tab bar */}
      <div className="bg-gray-900 border-b border-gray-700 overflow-x-auto">
        <div className="flex min-w-max px-4">
          {TABS.map((tab) => {
            const isLocked =
              isRestricted && (tab.id === 'privacy' || tab.id === 'location');
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
                {isLocked && <span className="text-yellow-400 text-xs">🔒</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'privacy' && <PrivacyTab restricted={isRestricted} />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'location' && <LocationTab restricted={isRestricted} />}
            {activeTab === 'safety' && <SafetyTab />}
            {activeTab === 'parental' && <ParentalTab />}
          </>
        )}
      </main>
    </div>
  );
}
