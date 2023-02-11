export interface BareSlice<K extends string = any, SS = any> {
  key: K;
  initState: SS;
}
