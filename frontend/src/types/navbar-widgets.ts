export type NavbarWidgetType = 'clock' | 'weather';

export type ClockFormat = '12' | '24';

export interface ClockWidgetConfig {
  format: ClockFormat;
  showSeconds: boolean;
  showDate: boolean;
  /** `local` uses the device timezone; otherwise an IANA timezone id */
  timezone: 'local' | string;
}

export interface WeatherWidgetConfig {
  locationLabel: string;
  latitude: number;
  longitude: number;
  units: 'celsius' | 'fahrenheit';
}

export interface NavbarWidgetBase {
  id: string;
  enabled: boolean;
}

export interface ClockNavbarWidget extends NavbarWidgetBase {
  type: 'clock';
  config: ClockWidgetConfig;
}

export interface WeatherNavbarWidget extends NavbarWidgetBase {
  type: 'weather';
  config: WeatherWidgetConfig;
}

export type NavbarWidget = ClockNavbarWidget | WeatherNavbarWidget;

export const DEFAULT_CLOCK_CONFIG: ClockWidgetConfig = {
  format: '24',
  showSeconds: false,
  showDate: false,
  timezone: 'local',
};

export const DEFAULT_WEATHER_CONFIG: WeatherWidgetConfig = {
  locationLabel: 'London',
  latitude: 51.5074,
  longitude: -0.1278,
  units: 'celsius',
};
