/**
 * Standardized API response format utility
 */
export class ResponseUtil {
  static success<T>(data: T, message?: string) {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  static error(error: string | Error, statusCode?: number) {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    return {
      success: false,
      error: errorMessage,
      statusCode,
      timestamp: new Date().toISOString(),
    };
  }

  static paginated<T>(
    data: T[],
    total: number,
    page: number = 1,
    limit: number = 10
  ) {
    return {
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
