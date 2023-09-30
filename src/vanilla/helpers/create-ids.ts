import { FieldId, SliceId } from '../types';

export function createFieldId(id: string): FieldId {
  return id as FieldId;
}

export function createSliceId(id: string): SliceId {
  return id as SliceId;
}
