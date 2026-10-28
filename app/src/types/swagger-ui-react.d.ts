declare module 'swagger-ui-react' {
  import type {ComponentType} from 'react';
  const SwaggerUI: ComponentType<{
    spec?: object;
    docExpansion?: 'list' | 'full' | 'none';
    defaultModelsExpandDepth?: number;
    deepLinking?: boolean;
    tryItOutEnabled?: boolean;
    plugins?: Array<(...args: never[]) => {components?: Record<string, ComponentType<object>>}>;
  }>;
  export default SwaggerUI;
}
