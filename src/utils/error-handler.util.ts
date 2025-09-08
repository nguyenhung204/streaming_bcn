import { Logger } from '@nestjs/common';

export interface ErrorHandlerOptions {
  logger: Logger;
  context?: string;
  throwError?: boolean;
  defaultValue?: any;
}

/**
 * Generic error handler utility to reduce code duplication
 */
export class ErrorHandler {
  static async handle<T>(
    operation: () => Promise<T>,
    options: ErrorHandlerOptions
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error';
      const context = options.context ? `${options.context}: ` : '';
      
      options.logger.error(`${context}${errorMessage}`, error.stack);
      
      if (options.throwError) {
        throw error;
      }
      
      return options.defaultValue ?? null;
    }
  }

  static handleSync<T>(
    operation: () => T,
    options: ErrorHandlerOptions
  ): T | null {
    try {
      return operation();
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error';
      const context = options.context ? `${options.context}: ` : '';
      
      options.logger.error(`${context}${errorMessage}`, error.stack);
      
      if (options.throwError) {
        throw error;
      }
      
      return options.defaultValue ?? null;
    }
  }
}
