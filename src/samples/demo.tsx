/** @jsxRuntime automatic */
/** @jsxImportSource ../pipis */

// The page that the demos of the documentation are shown in: `demo-app.html#todo` is the todo app, on its own.
import './styles.css';
import type { JSXElement } from '../pipis/index.ts';
import { FeedbackApp } from './feedback.tsx';
import { TodoApp } from './todo.tsx';
import { WeatherApp } from './weather.tsx';

const demos: Record<string, () => JSXElement> = { todo: TodoApp, weather: WeatherApp, feedback: FeedbackApp };

const demo = demos[location.hash.slice(1)];
if (demo) demo()(document.body);
else document.body.textContent = `No demo named '${location.hash.slice(1)}'. The demos are: ${Object.keys(demos).join(', ')}.`;
