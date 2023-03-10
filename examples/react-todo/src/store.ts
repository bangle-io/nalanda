import { Store, createUseSliceHook, Slice } from 'nalanda';

type Todo = {
  title: string;
  completed: boolean;
};

const todosInitState: {
  todos: Todo[];
  filter: 'all' | 'completed' | 'incompleted';
} = {
  todos: [],
  filter: 'incompleted',
};

export const todoSlice = new Slice({
  dependencies: [],
  name: 'todo-slice',
  initState: todosInitState,
  selectors: {
    filteredTodos: (state) => {
      if (state.filter === 'all') {
        return state.todos;
      }
      if (state.filter === 'completed') {
        return state.todos.filter((t) => t.completed);
      }
      return state.todos.filter((t) => !t.completed);
    },
  },
  actions: {
    addTodo: (todo: Todo) => (state) => {
      return {
        ...state,
        todos: [...state.todos, todo],
      };
    },
    removeTodo: (todo: Todo) => (state) => {
      return {
        ...state,
        todos: state.todos.filter((t) => t !== todo),
      };
    },
    setFilterValue:
      (filter: 'all' | 'completed' | 'incompleted') => (state) => {
        return {
          ...state,
          filter,
        };
      },
    toggleCompleted: (todo: Todo) => (state) => {
      return {
        ...state,
        todos: state.todos.map((t) => {
          if (t === todo) {
            return {
              ...t,
              completed: true,
            };
          }
          return t;
        }),
      };
    },
  },
});

const myStore = Store.create({
  storeName: 'myStore',
  state: [todoSlice],
  debug: console.log.bind(console),
});

export const useSlice = createUseSliceHook(myStore);
