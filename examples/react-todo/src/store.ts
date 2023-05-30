import {
  Store,
  createUseSliceHook,
  Slice,
  createSliceWithSelectors,
  createSelector,
} from 'nalanda';

type Todo = {
  title: string;
  completed: boolean;
};

const todosInitState: {
  input: string | undefined;
  todos: Todo[];
  filter: 'all' | 'completed' | 'incompleted';
} = {
  input: undefined,
  todos: [],
  filter: 'incompleted',
};

export const todoSlice = createSliceWithSelectors([], {
  name: 'todo-slice',
  initState: todosInitState,
  selectors: {
    filteredTodos: createSelector(
      {
        todos: (state) => {
          return state.todos;
        },
        filter: (state) => state.filter,
      },
      ({ todos, filter }) => {
        let result: any;
        if (filter === 'all') {
          result = todos;
        } else if (filter === 'completed') {
          result = todos.filter((t) => t.completed);
        } else {
          result = todos.filter((t) => !t.completed);
        }

        return result as Todo[];
      },
    ),
  },
});

export const addTodo = Slice.createAction(
  todoSlice,
  'addTodo',
  (todo: Todo) => {
    return (state) => {
      return {
        ...state,
        todos: [...state.todos, todo],
      };
    };
  },
);

export const removeTodo = Slice.createAction(
  todoSlice,
  'removeTodo',
  (todo: Todo) => {
    return (state) => {
      return {
        ...state,
        todos: state.todos.filter((t) => t !== todo),
      };
    };
  },
);

export const setFilterValue = Slice.createAction(
  todoSlice,
  'setFilterValue',
  (filter: 'all' | 'completed' | 'incompleted') => {
    return (state) => {
      return {
        ...state,
        filter,
      };
    };
  },
);

export const setInput = Slice.createAction(
  todoSlice,
  'setInput',
  (val: string | undefined) => {
    return (state) => {
      return {
        ...state,
        input: val,
      };
    };
  },
);

export const toggleCompleted = Slice.createAction(
  todoSlice,
  'toggleCompleted',
  (todo: Todo) => {
    return (state) => {
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
    };
  },
);

const myStore = Store.create({
  storeName: 'myStore',
  state: [todoSlice],
  debug: console.log.bind(console),
});

export const useSlice = createUseSliceHook(myStore);
