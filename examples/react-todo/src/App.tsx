import type { FormEvent } from 'react';
import { a, useTransition } from '@react-spring/web';
import { Radio } from 'antd';
import {
  addTodo,
  removeTodo,
  setFilterValue,
  setInput,
  todoSlice,
  toggleCompleted,
  useSlice,
} from './store';
type Todo = {
  title: string;
  completed: boolean;
};

const TodoItem = ({ todoItem }: { todoItem: Todo }) => {
  const [, dispatch] = useSlice(todoSlice);

  const toggleCompletedChange = () => {
    dispatch(toggleCompleted(todoItem));
  };

  return (
    <>
      <input
        type="checkbox"
        checked={todoItem.completed}
        onChange={toggleCompletedChange}
      />
      <span
        style={{ textDecoration: todoItem.completed ? 'line-through' : '' }}
      >
        {todoItem.title}
      </span>
      <button
        onClick={(e) => {
          dispatch(removeTodo(todoItem));
        }}
      >
        ❌
      </button>
    </>
  );
};

const Filter = () => {
  const [{ filter }, dispatch] = useSlice(todoSlice);
  return (
    <Radio.Group
      onChange={(e) => dispatch(setFilterValue(e.target.value))}
      value={filter}
    >
      <Radio value="all">All</Radio>
      <Radio value="completed">Completed</Radio>
      <Radio value="incompleted">Incompleted</Radio>
    </Radio.Group>
  );
};

const Filtered = () => {
  const [{ filteredTodos }] = useSlice(todoSlice);
  const transitions = useTransition(filteredTodos, {
    keys: (todo) => todo.title,
    from: { opacity: 0, height: 0 },
    enter: { opacity: 1, height: 40 },
    leave: { opacity: 0, height: 0 },
  });

  return transitions((style, item) => (
    <a.div className="item" style={style}>
      <TodoItem todoItem={item} />
    </a.div>
  ));
};

const TodoList = () => {
  const [{ input }, dispatch] = useSlice(todoSlice);

  return (
    <>
      <Filter />
      <input
        name="inputTitle"
        placeholder="Type ..."
        value={input}
        onChange={(e) => dispatch(setInput(e.currentTarget.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const title = e.currentTarget.value;
            dispatch(addTodo({ title, completed: false }));
            return;
          }
        }}
      />
      <Filtered />
    </>
  );
};

export default function App() {
  return (
    <>
      <h1>Nalanda</h1>
      <TodoList />
    </>
  );
}
