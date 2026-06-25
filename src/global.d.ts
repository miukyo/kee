declare namespace gapi {
    function load(api: string, callback: () => void): void;
    namespace client {
        function init(config: { discoveryDocs: string[] }): Promise<void>;
        function getToken(): { access_token: string } | null;
        function setToken(token: string | {}): void;
        namespace drive {
            namespace files {
                function list(params: {
                    spaces?: string;
                    pageSize?: number;
                    fields?: string;
                }): Promise<{ result: { files: Array<{ id: string; name: string }> } }>;
            }
        }
    }
}

declare namespace google {
    namespace accounts {
        namespace oauth2 {
            function initTokenClient(config: {
                client_id: string;
                scope: string;
                callback: string | ((resp: any) => void);
            }): any;
            function revoke(token: string): void;
        }
    }
}
