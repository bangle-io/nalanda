import type { FormEvent } from 'react';
import { a, useTransition } from '@react-spring/web';
import { Radio } from 'antd';
import { todoSlice, useSlice } from './store';
type Todo = {
  title: string;
  completed: boolean;
};

const TodoItem = ({ todoItem }: { todoItem: Todo }) => {
  const [, dispatch] = useSlice(todoSlice);

  const toggleCompleted = () => {
    dispatch(todoSlice.actions.toggleCompleted(todoItem));
  };
  return (
    <>
      <input
        type="checkbox"
        checked={todoItem.completed}
        onChange={toggleCompleted}
      />
      <span
        style={{ textDecoration: todoItem.completed ? 'line-through' : '' }}
      >
        {todoItem.title}
      </span>
      <button
        onClick={() => {
          dispatch(todoSlice.actions.removeTodo(todoItem));
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
      onChange={(e) =>
        dispatch(todoSlice.actions.setFilterValue(e.target.value))
      }
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

  console.log({ filteredTodos });
  const transitions = useTransition(filteredTodos, {
    keys: (todo) => todo.toString(),
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
  const [, dispatch] = useSlice(todoSlice);

  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const title = e.currentTarget.inputTitle.value;
    e.currentTarget.inputTitle.value = '';

    dispatch(todoSlice.actions.addTodo({ title, completed: false }));
  };

  return (
    <form onSubmit={add}>
      <Filter />
      <input name="inputTitle" placeholder="Type ..." />
      <Filtered />
    </form>
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
