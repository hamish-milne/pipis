/** @jsxRuntime automatic */
/** @jsxImportSource ../pipis */

import './styles.css';
import { reactive, select, Suspense, Watch, type ReactiveReadonly } from '../pipis/index.ts';

type WeatherData = {
  temperature: number;
  windSpeed: number;
  code: number;
};

const WEATHER_CODES: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '☀️', label: 'Clear sky' },
  1: { emoji: '🌤️', label: 'Mostly clear' },
  2: { emoji: '⛅', label: 'Partly cloudy' },
  3: { emoji: '☁️', label: 'Overcast' },
  45: { emoji: '🌫️', label: 'Fog' },
  48: { emoji: '🌫️', label: 'Freezing fog' },
  51: { emoji: '🌦️', label: 'Light drizzle' },
  53: { emoji: '🌦️', label: 'Drizzle' },
  55: { emoji: '🌦️', label: 'Dense drizzle' },
  61: { emoji: '🌧️', label: 'Light rain' },
  63: { emoji: '🌧️', label: 'Rain' },
  65: { emoji: '🌧️', label: 'Heavy rain' },
  71: { emoji: '🌨️', label: 'Light snow' },
  73: { emoji: '🌨️', label: 'Snow' },
  75: { emoji: '🌨️', label: 'Heavy snow' },
  80: { emoji: '🌦️', label: 'Rain showers' },
  81: { emoji: '🌦️', label: 'Heavy showers' },
  82: { emoji: '⛈️', label: 'Violent showers' },
  95: { emoji: '⛈️', label: 'Thunderstorm' },
};

function describeWeather(code: number) {
  return WEATHER_CODES[code] ?? { emoji: '❓', label: 'Unknown' };
}

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
}

async function fetchWeather(): Promise<WeatherData> {
  const { coords } = await locate();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo responded with ${response.status}`);
  }
  const { current } = await response.json();
  return {
    temperature: current.temperature_2m,
    windSpeed: current.wind_speed_10m,
    code: current.weather_code,
  };
}

export function WeatherApp() {
  const theme = reactive<'light' | 'dark'>(
    (localStorage.getItem('weather-theme') as 'light' | 'dark' | null) ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function weatherCard(weather: ReactiveReadonly<WeatherData>) {
    const info = select(weather, (w) => describeWeather(w.code));
    const temperature = select(weather, (w) => Math.round(w.temperature));
    const windSpeed = select(weather, (w) => Math.round(w.windSpeed));

    return (
      <div className="flex flex-col items-center gap-1 py-4 text-center">
        <span className="text-6xl">{select(info, 'emoji')}</span>
        <span className="text-4xl font-semibold tabular-nums">{temperature}°C</span>
        <span className="text-sm text-slate-500 dark:text-slate-400" data-theme={theme}>
          {select(info, 'label')}
        </span>
        <span className="mt-2 text-xs text-slate-400 dark:text-slate-500" data-theme={theme}>
          Wind {windSpeed} km/h
        </span>
      </div>
    );
  }

  function LoadingCard() {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-white/10 dark:border-t-white"
          data-theme={theme}
        />
        Finding your local weather...
      </div>
    );
  }

  function errorCard(error: ReactiveReadonly<unknown>) {
    const message = select(error, (err) =>
      err instanceof GeolocationPositionError
        ? 'Location access was denied - enable it to see the weather.'
        : err instanceof Error
          ? err.message
          : 'Something went wrong.',
    );
    return <p className="py-10 text-center text-sm text-rose-500">{message}</p>;
  }

  return (
    <div
      data-theme={theme}
      className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-16 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100"
    >
      <Watch value={theme}>{(value) => localStorage.setItem('weather-theme', value)}</Watch>

      <div
        data-theme={theme}
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-300/50 ring-1 ring-slate-200 transition-colors dark:bg-slate-900 dark:shadow-black/40 dark:ring-white/10"
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <h1 className="text-lg font-semibold tracking-tight">Weather</h1>
          <button
            onclick={toggleTheme}
            title="Toggle theme"
            data-theme={theme}
            className="rounded-full p-2 text-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <span data-theme={theme} className="dark:hidden">
              🌙
            </span>
            <span data-theme={theme} className="hidden dark:inline">
              ☀️
            </span>
          </button>
        </div>

        <div className="px-6 pb-6 pt-4">
          <Suspense
            promise={fetchWeather}
            emptyData={{ code: 0, temperature: 0, windSpeed: 0 }}
            loading={<LoadingCard />}
            error={errorCard}
          >
            {weatherCard}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
