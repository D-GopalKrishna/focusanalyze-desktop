export type ReorderQuoteMap = (args: {
  quoteMap: { [key: string]: any[] };
  source: { droppableId: string; index: number };
  destination: { droppableId: string; index: number };
}) => { quoteMap: { [key: string]: any[] } };

export type MoveBetween = (args: {
  list1: { id: string; values: any[] };
  list2: { id: string; values: any[] };
  source: { droppableId: string; index: number };
  destination: { droppableId: string; index: number };
}) => {
  list1: { id: string; values: any[] };
  list2: { id: string; values: any[] };
};

// TODO: check if this is need to be - any[]
export type Reorder = (list: any[], startIndex: number, endIndex: number) => any[];
