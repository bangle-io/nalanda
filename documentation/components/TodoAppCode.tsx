import { CodeBlockTabs } from './CodeBlock';

export function TodoAppCode({ height }: { height?: number }) {
  return (
    <CodeBlockTabs
      closableTabs={false}
      height={height}
      appSource={`
import { createStore } from "@nalanda/core";
import { StoreProvider } from "@nalanda/react";
import { todoSlice } from "./todo-slice";
import { Todo } from "./Todo";

// Establish a global store incorporating your slices.
const store = createStore({
  slices: [todoSlice]
});

export default function App() {
  return (
    <StoreProvider store={store}>
      <div className="App">
        <Todo />
      </div>
    </StoreProvider>
  );
}

    `}
      otherSources={{
        '/Todo.tsx': `
import React, { useRef } from "react";
import { useTrack, useStore } from "@nalanda/react";
import { Filter, todoSlice } from "./todo-slice";

export function Todo() {
  const { filteredTodos } = useTrack(todoSlice);
  const store = useStore();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = () => {
    if (!inputRef.current || !inputRef.current?.value) {
      return;
    }
    store.dispatch(
      todoSlice.addTodo({
        description: inputRef.current.value
      })
    );
    inputRef.current.value = ""; // Clear the input value
  };

  return (
    <>
      <Filters />
      <label>Todo</label>
      <input
        ref={inputRef}
        name="description"
        type="text"
        onKeyPress={(event) => {
          if (event.key === "Enter") {
            handleSubmit();
          }
        }}
      />
      <button onClick={handleSubmit}>Add new</button>
      <ul>
        {filteredTodos.map((todo) => {
          return (
            <li
              key={todo.id}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "0.5rem",
                textDecoration:
                  todo.status === "completed" ? "line-through" : undefined
              }}
            >
              <input
                type="checkbox"
                checked={todo.status === "completed"}
                onChange={() => {
                  store.dispatch(todoSlice.markComplete(todo.id));
                }}
              />
              <span data-status={status} className="description">
                {todo.description}
              </span>
              <button
                className="remove"
                onClick={() => {
                  store.dispatch(todoSlice.deleteTodo(todo.id));
                }}
              >
                x
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const FILTER_TYPES: Filter[] = ["all", "pending", "completed"];

function Filters() {
  const { filter } = useTrack(todoSlice);
  const store = useStore();

  return (
    <div>
      {FILTER_TYPES.map((filterType) => {
        return (
          <React.Fragment key={filterType}>
            <input
              name="filter"
              type="radio"
              value={filterType}
              checked={filter === filterType}
              onChange={() => {
                store.dispatch(todoSlice.changeFilterType(filterType));
              }}
            />
            <label>{filterType}</label>
          </React.Fragment>
        );
      })}
    </div>
  );
}
`,

        '/todo-slice.ts': `
import { createKey } from "@nalanda/react";

// Initialize a key to configure our slice
const key = createKey("todoSlice", []);

// Todos can have one of two statuses
type Status = "pending" | "completed";

// We'll use this filter to sift through the todos
export type Filter = Status | "all";

type Todo = {
    description: string;
    id: number;
    status: Status;
};

const initialTodos: Todo[] = [
  {
    id: 0,
    description: "Water the plants",
    status: "pending"
  }
];

const filterField = key.field<Filter>("all");

const todosField = key.field<Todo[]>(initialTodos);

const filteredTodosField = key.derive((state) => {
  const filter = filterField.get(state);
  const todos = todosField.get(state);
  if (filter === "all") {
    return todos;
  }
  return todos.filter((todo) => {
    return todo.status === filter;
  });
});

function markComplete(id: number) {
  return todosField.update((todos) => {
    return todos.map((todo) => {
      if (todo.id === id) {
        return {
          ...todo,
          status: todo.status === "completed" ? "pending" : "completed"
        };
      }
      return todo;
    });
  });
}

function addTodo({ description }: { description: string }) {
  return todosField.update((todos) => {
    const todo: Todo = {
      id: todos.length,
      description,
      status: "pending"
    };

    return [...todos, todo];
  });
}

function deleteTodo(id: number) {
  return todosField.update((todos) => {
    return todos
      .map((todo) => {
        if (todo.id === id) {
          return undefined;
        }
        return todo;
      })
      .filter((todo): todo is Todo => !!todo);
  });
}

function changeFilterType(filterType: Filter) {
  return filterField.update(filterType);
}

export const todoSlice = key.slice({
  filteredTodos: filteredTodosField,
  filter: filterField,
  // actions
  changeFilterType,
  addTodo,
  markComplete,
  deleteTodo
});

`,
      }}
    />
  );
}
