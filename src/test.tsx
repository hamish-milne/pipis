/// <reference types="vite/client" />
/** @jsxRuntime automatic */
/** @jsxImportSource ./pipis */

import "./samples/styles.css";
import { select, reactive } from "./pipis/reactive";
import {
  ErrorBoundary,
  List,
  Portal,
  PortalTarget,
  Suspense,
  type PortalTargetValue,
} from "./pipis/dynamic";
import type { JSXElement } from "./pipis/core";
import { Markdown, renderToken } from "./pipis/markdown";
import readme from "../README.md?raw";
import { HighlightJS } from "./pipis/highlight";

export function Counter() {
  const count = reactive(0);

  return (
    <div>
      <p>{count}</p>
      <button onclick={() => count.value++}>Increment</button>
    </div>
  );
}

export function TodoApp() {
  const todos = reactive<readonly string[]>([]);
  const newTodo = reactive("");

  function todoItem(item: string, index: number) {
    return (
      <li>
        {item}
        <button
          onclick={() => {
            todos.value = todos.value.filter((_, i) => i !== index);
          }}
        >
          Remove
        </button>
      </li>
    );
  }

  return (
    <>
      <ul>
        <List items={todos} itemKey={(item, index) => index}>
          {todoItem}
        </List>
      </ul>
      <div>
        <input type="text" value={newTodo} onchange={(e) => (newTodo.value = e.target.value)} />
        <button
          onclick={() => {
            todos.value = [...todos.value, newTodo.value];
            newTodo.value = "";
          }}
        >
          Add Todo
        </button>
      </div>
    </>
  );
}

function PortalExample() {
  const portalTarget = reactive<PortalTargetValue>();

  return (
    <>
      <div>
        <PortalTarget ref={portalTarget} />
      </div>
      <Portal target={portalTarget}>
        <p>This will be rendered in the portal target</p>
      </Portal>
    </>
  );
}

function ComponentThatThrowsOnMount(): JSXElement {
  return () => {
    throw new Error("ComponentThatThrowsOnMount threw an error on mount");
  };
}

function ErrorBoundaryExample() {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <p>Error: {select(err, (e) => (e as Error)?.message ?? "Unknown error")}</p>
      )}
    >
      <ComponentThatThrowsOnMount />
    </ErrorBoundary>
  );
}

function SuspenseExample() {
  return (
    <Suspense
      promise={() => new Promise<string>((resolve) => setTimeout(() => resolve("Some data"), 2000))}
      placeholder=""
      success={(data) => <p>Content loaded successfully: {data}</p>}
      error={(err) => <p>Error: {select(err, (e) => (e as Error)?.message ?? "Unknown error")}</p>}
    >
      <p>Loading...</p>
    </Suspense>
  );
}

function ListExample() {
  const items = reactive<readonly string[]>(["Item 1", "Item 2", "Item 3"]);

  // Insertion test: every 0.2s, add a new item to the list in a random position
  setInterval(() => {
    const newItem = `Item ${items.value.length + 1}`;
    const index = Math.floor(Math.random() * (items.value.length + 1));
    items.value = [...items.value.slice(0, index), newItem, ...items.value.slice(index)];
    // items.value = [...items.value, newItem];
  }, 1000);

  return (
    <ul>
      <List items={items} itemKey={(item) => item}>
        {(item, index) => <li>{item}</li>}
      </List>
    </ul>
  );
}

function MarkdownExample() {
  return (
    <Markdown
      content={readme}
      renderer={(token) => {
        switch (token.type) {
          case "code":
            return (
              <pre>
                <HighlightJS language={token.lang}>{token.text}</HighlightJS>
              </pre>
            );
          default:
            return renderToken(token);
        }
      }}
    />
  );
}

function InlineStyleExample() {
  const color = reactive("red");

  return <div style={{ color, scale: "1" }}>This text is styled with a reactive color.</div>;
}

function classComponent<T>(clazz: { new (props: Partial<T>): { element: JSXElement } }) {
  return (props: Partial<T>): JSXElement => {
    const instance = new clazz(props);
    return instance.element.bind(instance);
  };
}

class _ClassTest {
  constructor(props: Partial<_ClassTest>) {
    Object.assign(this, props);
  }

  foo = 1;
  bar = "abc";
  element = (
    <div>
      {this.foo} - {this.bar}
    </div>
  );
}
const ClassTest = classComponent(_ClassTest);

export function Main() {
  return (
    <>
      <Counter />
      <TodoApp />
      <ErrorBoundaryExample />
      <PortalExample />
      <SuspenseExample />
      <ListExample />
      <MarkdownExample />
    </>
  );
}

Main()(document.body);
