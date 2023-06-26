type TransactionOpts<TSliceName extends string, TParams extends any[]> = {
  name: TSliceName;
  params: TParams;
};

export class Transaction<TSliceName extends string, TParams extends any[]> {
  constructor(private opts: TransactionOpts<TSliceName, TParams>) {}
}
