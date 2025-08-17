export type IsAny<T> = 0 extends 1 & NoInfer<T> ? true : false;
export type IsOptional<T> = IsAny<T> extends true ? true : Extract<T, undefined> extends never ? false : true;
