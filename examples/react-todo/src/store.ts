import { Store, createUseSliceHook, Slice, createSlice } from 'nalanda';

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

export const todoSlice = createSlice([], {
  name: 'todo-slice',
  initState: todosInitState,
  selector: (state) => {
    let result: any;
    if (state.filter === 'all') {
      result = state.todos;
    } else if (state.filter === 'completed') {
      result = state.todos.filter((t) => t.completed);
    } else {
      result = state.todos.filter((t) => !t.completed);
    }

    return {
      filteredTodos: result,
    };
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
